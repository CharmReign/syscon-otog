import { beforeEach, describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/access';
import { DocumentError, extractSections, validateUpload } from '@/lib/server/documents/extract';
import { searchDocuments } from '@/lib/server/documents/search';
import { POST as uploadDoc, GET as listDocs } from '@/app/api/levelup/documents/route';
import { GET as getDoc } from '@/app/api/levelup/documents/[id]/route';
import { POST as createQuiz } from '@/app/api/levelup/quizzes/route';
import { SUPPORT_TEXT, call, createUser, makeDocx, makePdf, req, textFile, uploadForm, useTempDataDir } from './helpers';

const upload = (user, file, fields) => call(uploadDoc, req('/api/levelup/documents', { method: 'POST', user, form: uploadForm(file, fields) }));

describe('extraction', () => {
  it('splits Markdown into sections by heading', async () => {
    const { sections } = await extractSections(Buffer.from(SUPPORT_TEXT), 'md');
    expect(sections.map(s => s.heading)).toEqual(['Ticket Triage Procedure', 'Escalation Rules', 'Release Verification', 'Knowledge Articles']);
  });

  it('keeps page numbers for PDFs', async () => {
    const paragraphs = SUPPORT_TEXT.split(/\n\n# /);
    const pdf = makePdf([paragraphs[0] + ' ' + paragraphs[1], paragraphs[2] + ' ' + paragraphs[3]].map(p => p.replace(/[#\n]/g, ' ')));
    const { sections, pageCount } = await extractSections(pdf, 'pdf');
    expect(pageCount).toBe(2);
    expect(sections.map(s => s.page)).toEqual([1, 2]);
    expect(sections[1].text).toMatch(/Sanity Checklist/);
  });

  it('keeps headings for Word documents', async () => {
    const docx = await makeDocx([
      { heading: 'Escalation Rules' },
      { text: 'Severity 1 tickets are escalated to the Duty Manager immediately after classification. The Duty Manager informs the client account lead within 30 minutes.' },
      { heading: 'Knowledge Articles' },
      { text: 'Resolved tickets that required more than 2 hours of investigation must be written up as a Confluence knowledge article for the support team.' },
    ]);
    const { sections } = await extractSections(docx, 'docx');
    expect(sections.map(s => s.heading)).toEqual(['Escalation Rules', 'Knowledge Articles']);
  });

  it('rejects unsupported, renamed, binary and empty files', () => {
    expect(() => validateUpload({ filename: 'a.exe', size: 10, buffer: Buffer.from('MZ.......') })).toThrow(/aren't supported/);
    expect(() => validateUpload({ filename: 'deck.pptx', size: 10, buffer: Buffer.from('PK\x03\x04') })).toThrow(DocumentError);
    expect(() => validateUpload({ filename: 'fake.pdf', size: 10, buffer: Buffer.from('hello world') })).toThrow(/valid PDF/);
    expect(() => validateUpload({ filename: 'fake.docx', size: 10, buffer: Buffer.from('hello world') })).toThrow(/valid Word/);
    expect(() => validateUpload({ filename: 'bin.txt', size: 4, buffer: Buffer.from([0x41, 0, 0x42, 0]) })).toThrow(/binary/);
    expect(() => validateUpload({ filename: 'empty.txt', size: 0, buffer: Buffer.alloc(0) })).toThrow(/empty/);
  });

  it('reports documents without enough text, such as scanned PDFs', async () => {
    await expect(extractSections(makePdf(['']), 'pdf')).rejects.toThrow(/scanned PDF/);
    await expect(extractSections(Buffer.from('Too short.'), 'txt')).rejects.toThrow(/too little text/);
  });
});

describe('upload workflow', () => {
  let admin, employee;
  beforeEach(() => {
    useTempDataDir();
    admin = createUser(ROLES.ADMIN, 'Ada Admin');
    employee = createUser(ROLES.EMPLOYEE, 'Erin Employee');
  });

  it('processes a supported file and records metadata', async () => {
    const { status, data } = await upload(admin, textFile(), { title: 'Support procedure', category: 'SUPPORT' });
    expect(status).toBe(201);
    expect(data.document).toMatchObject({ title: 'Support procedure', category: 'SUPPORT', status: 'READY', sectionCount: 4, uploadedByName: 'Ada Admin' });
    expect(data.document.storageKey).toBeUndefined();
  });

  it('rejects unsupported types without storing anything', async () => {
    const { status, data } = await upload(admin, new File(['x'], 'evil.html'));
    expect(status).toBe(415);
    expect(data.error.message).toMatch(/supported/);
    const list = await call(listDocs, req('/api/levelup/documents', { user: admin }));
    expect(list.data.documents).toHaveLength(0);
  });

  it('marks unreadable documents FAILED, hides them from employees, and refuses to build quizzes', async () => {
    const { status, data } = await upload(admin, new File([makePdf([''])], 'scan.pdf'));
    expect(status).toBe(422);
    expect(data.document.status).toBe('FAILED');
    expect(data.document.error).toMatch(/OCR/);

    const asEmployee = await call(listDocs, req('/api/levelup/documents', { user: employee }));
    expect(asEmployee.data.documents).toHaveLength(0);
    const quiz = await call(createQuiz, req('/api/levelup/quizzes', { method: 'POST', user: admin, body: { documentId: data.document.id } }));
    expect(quiz.status).toBe(409);
  });

  it('serves section content to employees and finds it in search', async () => {
    const { data } = await upload(admin, textFile());
    const doc = await call(getDoc, req(`/api/levelup/documents/${data.document.id}?content=1`, { user: employee }), { id: data.document.id });
    expect(doc.data.document.sections).toHaveLength(4);
    const hits = searchDocuments('duty manager escalation');
    expect(hits[0]).toMatchObject({ documentId: data.document.id, ref: 'Escalation Rules' });
  });
});
