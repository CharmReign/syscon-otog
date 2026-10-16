// Document lifecycle shared by Level Up (quiz sources) and the AS-IS Navigator:
// validate -> store -> extract -> READY, or FAILED with an actionable message.
import { v4 as uuidv4 } from 'uuid';

import { DOC_CATEGORIES, DOC_STATUS } from '@/lib/levelup';
import { isAdmin } from '@/lib/access';
import { audit } from '@/lib/server/audit';
import { deleteContent, deleteUpload, readContent, readUpload, saveContent, saveUpload } from '@/lib/server/files';
import { HttpError, notFound } from '@/lib/server/http';
import { findAll, findOne, insertOne, updateOne, deleteOne } from '@/lib/server/store';
import { DocumentError, SUPPORTED_TYPES, cleanFilename, extractSections, validateUpload } from '@/lib/server/documents/extract';

const CATEGORY_VALUES = DOC_CATEGORIES.map(c => c.value);

// Fields everyone may see. Storage keys and the uploader's id stay server-side.
export const publicDocument = (d) => d && ({
  id: d.id, title: d.title, description: d.description, category: d.category,
  filename: d.filename, ext: d.ext, size: d.size, status: d.status, error: d.error || null,
  sectionCount: d.sectionCount || 0, pageCount: d.pageCount || null, charCount: d.charCount || 0,
  uploadedByName: d.uploadedByName, uploadedAt: d.uploadedAt, processedAt: d.processedAt || null,
});

async function runExtraction(doc) {
  try {
    const content = await extractSections(await readUpload(doc.storageKey), doc.ext);
    await saveContent(doc.id, content);
    return await updateOne('documents', doc.id, {
      status: DOC_STATUS.READY, error: null, processedAt: new Date().toISOString(),
      sectionCount: content.sections.length, pageCount: content.pageCount, charCount: content.charCount,
    });
  } catch (e) {
    const message = e instanceof DocumentError ? e.message : 'Processing failed unexpectedly. Try reprocessing, or re-save the file and upload it again.';
    if (!(e instanceof DocumentError)) console.error('[documents] processing error:', e?.message);
    await deleteContent(doc.id);
    return updateOne('documents', doc.id, { status: DOC_STATUS.FAILED, error: message, processedAt: new Date().toISOString() });
  }
}

// file: a web File from formData. Type/size/signature problems reject the upload outright;
// problems found while reading the content are recorded on the document as FAILED.
export async function uploadDocument(user, { file, title, description, category }) {
  if (!(file && typeof file === 'object' && typeof file.arrayBuffer === 'function')) {
    throw new HttpError(400, 'Choose a file to upload.', 'BAD_REQUEST');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  let ext;
  try {
    ext = validateUpload({ filename: file.name, size: buffer.length, buffer });
  } catch (e) {
    if (e instanceof DocumentError) throw new HttpError(e.status, e.message, e.code);
    throw e;
  }
  const filename = cleanFilename(file.name);
  const id = uuidv4();
  const storageKey = await saveUpload(id, ext, buffer);
  const doc = await insertOne('documents', {
    id,
    title: title || filename.replace(/\.[^.]+$/, ''),
    description: description || '',
    category: CATEGORY_VALUES.includes(category) ? category : 'OTHER',
    filename, ext, size: buffer.length, mime: SUPPORTED_TYPES[ext].mime,
    storageKey,
    status: DOC_STATUS.PROCESSING,
    uploadedById: user.id, uploadedByName: user.name, uploadedAt: new Date().toISOString(),
  });
  await audit(user, 'document.uploaded', 'document', id, `${filename} (${buffer.length} bytes)`);
  const processed = await runExtraction(doc);
  await audit(user, processed.status === DOC_STATUS.READY ? 'document.processed' : 'document.failed', 'document', id, processed.error || '');
  return processed;
}

export async function reprocessDocument(user, id) {
  const doc = await findOne('documents', id);
  if (!doc) throw notFound('Document not found.');
  await updateOne('documents', id, { status: DOC_STATUS.PROCESSING, error: null });
  const processed = await runExtraction(doc);
  await audit(user, 'document.reprocessed', 'document', id, processed.status);
  return processed;
}

export async function updateDocument(user, id, { title, description, category }) {
  const doc = await findOne('documents', id);
  if (!doc) throw notFound('Document not found.');
  const patch = {};
  if (title) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (category && CATEGORY_VALUES.includes(category)) patch.category = category;
  const updated = await updateOne('documents', id, patch);
  // Keep quiz labels in sync with the document title.
  if (patch.title) {
    for (const q of await findAll('quizzes', q => q.documentId === id)) await updateOne('quizzes', q.id, { documentTitle: patch.title });
  }
  await audit(user, 'document.updated', 'document', id, Object.keys(patch).join(', '));
  return updated;
}

// Refuses while quizzes still use the document unless cascade is set, in which case
// those quizzes go too. Attempt history keeps its own snapshot, so scores survive.
export async function deleteDocument(user, id, { cascade = false } = {}) {
  const doc = await findOne('documents', id);
  if (!doc) throw notFound('Document not found.');
  const quizzes = await findAll('quizzes', q => q.documentId === id);
  if (quizzes.length && !cascade) {
    throw new HttpError(409, `This document is the source of ${quizzes.length} quiz(zes). Remove them too, or delete the quizzes first.`, 'HAS_QUIZZES');
  }
  for (const q of quizzes) {
    await deleteOne('quizzes', q.id);
    await audit(user, 'quiz.deleted', 'quiz', q.id, `with document ${doc.title}`);
  }
  await deleteUpload(doc.storageKey);
  await deleteContent(id);
  await deleteOne('documents', id);
  await audit(user, 'document.deleted', 'document', id, doc.filename);
  return { ok: true, removedQuizzes: quizzes.length };
}

// Employees see processed documents only; admins also see processing and failed ones.
export async function listDocuments(user, { category } = {}) {
  return (await findAll('documents', d => (isAdmin(user) || d.status === DOC_STATUS.READY) && (!category || d.category === category)))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
    .map(publicDocument);
}

export async function getDocument(user, id, { withContent = false } = {}) {
  const doc = await findOne('documents', id);
  if (!doc || (!isAdmin(user) && doc.status !== DOC_STATUS.READY)) throw notFound('Document not found.');
  const out = publicDocument(doc);
  if (withContent) out.sections = (await readContent(id))?.sections || [];
  return out;
}

export async function getDocumentFile(user, id) {
  const doc = await findOne('documents', id);
  if (!doc || (!isAdmin(user) && doc.status !== DOC_STATUS.READY)) throw notFound('Document not found.');
  return { buffer: await readUpload(doc.storageKey), filename: doc.filename, mime: doc.mime };
}

export async function readySections(id) {
  const doc = await findOne('documents', id);
  if (!doc) throw notFound('Document not found.');
  if (doc.status !== DOC_STATUS.READY) throw new HttpError(409, 'The document has not been processed successfully yet.', 'NOT_READY');
  return { doc, sections: (await readContent(id))?.sections || [] };
}
