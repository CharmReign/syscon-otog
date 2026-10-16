import { beforeEach, describe, expect, it } from 'vitest';

import { ROLES } from '@/lib/access';
import { generateOfflineQuestions } from '@/lib/server/quiz/offline';
import { quizProblems, keepValid } from '@/lib/quiz-validation';
import { scoreAnswers } from '@/lib/server/quiz/service';
import { extractSections } from '@/lib/server/documents/extract';
import { _resetCache } from '@/lib/server/store';
import { POST as uploadDoc } from '@/app/api/levelup/documents/route';
import { GET as listQuizzes, POST as createQuiz } from '@/app/api/levelup/quizzes/route';
import { GET as getQuiz, PATCH as patchQuiz } from '@/app/api/levelup/quizzes/[id]/route';
import { POST as publish } from '@/app/api/levelup/quizzes/[id]/publish/route';
import { POST as unpublish } from '@/app/api/levelup/quizzes/[id]/unpublish/route';
import { POST as regenerate } from '@/app/api/levelup/quizzes/[id]/regenerate/route';
import { POST as submit } from '@/app/api/levelup/quizzes/[id]/submit/route';
import { GET as getAttempt } from '@/app/api/levelup/attempts/[id]/route';
import { GET as listAttempts } from '@/app/api/levelup/attempts/route';
import { GET as stats } from '@/app/api/levelup/stats/route';
import { SUPPORT_TEXT, call, createUser, req, textFile, uploadForm, useTempDataDir } from './helpers';

describe('offline generator', () => {
  it('writes valid questions traceable to their source section', async () => {
    const { sections } = await extractSections(Buffer.from(SUPPORT_TEXT), 'md');
    const ids = sections.map(s => s.id);
    const qs = generateOfflineQuestions(sections, { questionCount: 6, optionCount: 4, difficulty: 'MEDIUM', includeTrueFalse: true });
    expect(qs.length).toBeGreaterThanOrEqual(4);
    expect(keepValid(qs, ids)).toHaveLength(qs.length);
    for (const q of qs) {
      const section = sections.find(s => s.id === q.sourceSectionId);
      expect(section.text).toContain(q.sourceQuote.replace(/\s+/g, ' ').slice(0, 30));
      if (q.type === 'MULTIPLE_CHOICE') expect(q.options).toHaveLength(4);
    }
    expect(qs.some(q => q.type === 'TRUE_FALSE')).toBe(true);
  });

  it('honours the option count', async () => {
    const { sections } = await extractSections(Buffer.from(SUPPORT_TEXT), 'md');
    const qs = generateOfflineQuestions(sections, { questionCount: 3, optionCount: 3, difficulty: 'EASY' });
    expect(qs.every(q => q.options.length === 3)).toBe(true);
  });
});

describe('validation and scoring', () => {
  const q = (over = {}) => ({ id: 'q1', type: 'MULTIPLE_CHOICE', prompt: 'Who receives Severity 1 escalations?', options: ['Duty Manager', 'Product Specialist', 'Client'], correctIndex: 0, explanation: 'Stated in Escalation Rules.', sourceSectionId: 's2', ...over });

  it('flags missing answers, duplicate options, missing sources and duplicate questions', () => {
    expect(quizProblems([q()], ['s2'])).toEqual([]);
    expect(quizProblems([q({ correctIndex: 5 })], ['s2'])[0].problems).toContain('Choose the correct answer.');
    expect(quizProblems([q({ options: ['A', 'a', 'B'] })], ['s2'])[0].problems).toContain('Options must all be different.');
    expect(quizProblems([q({ sourceSectionId: 's9' })], ['s2'])[0].problems[0]).toMatch(/source document/);
    expect(quizProblems([q({ explanation: '' })], ['s2'])[0].problems).toContain('Add an explanation for the correct answer.');
    expect(quizProblems([q(), q({ id: 'q2' })], ['s2'])[0].problems[0]).toMatch(/Duplicate/);
    expect(quizProblems([], ['s2'])[0].problems[0]).toMatch(/no questions/);
  });

  it('scores correct, incorrect and unanswered questions', () => {
    const questions = [q(), q({ id: 'q2', correctIndex: 1 }), q({ id: 'q3', correctIndex: 2 })];
    const r = scoreAnswers(questions, { q1: 0, q2: 0 });
    expect(r).toMatchObject({ correct: 1, total: 3, score: 33 });
    expect(r.results.map(x => x.correct)).toEqual([true, false, false]);
    expect(() => scoreAnswers(questions, { nope: 1 })).toThrow(/not in this quiz/);
    expect(() => scoreAnswers(questions, { q1: 'A' })).toThrow(/option index/);
  });
});

describe('document-to-quiz workflow', () => {
  let admin, erin, sam;
  beforeEach(async () => {
    useTempDataDir();
    admin = await createUser(ROLES.ADMIN, 'Ada Admin');
    erin = await createUser(ROLES.EMPLOYEE, 'Erin Employee');
    sam = await createUser(ROLES.EMPLOYEE, 'Sam Support');
  });

  async function draftQuiz() {
    const up = await call(uploadDoc, req('/api/levelup/documents', { method: 'POST', user: admin, form: uploadForm(textFile(), { title: 'Support procedure' }) }));
    const created = await call(createQuiz, req('/api/levelup/quizzes', { method: 'POST', user: admin, body: { documentId: up.data.document.id, settings: { questionCount: 4 } } }));
    expect(created.status).toBe(201);
    return { doc: up.data.document, quiz: created.data.quiz };
  }

  it('creates an unpublished draft linked to its document, hidden from employees', async () => {
    const { doc, quiz } = await draftQuiz();
    expect(quiz).toMatchObject({ status: 'DRAFT', documentId: doc.id, documentTitle: 'Support procedure', generator: 'offline' });
    expect(quiz.questions.every(x => x.sourceSectionId && x.sourceRef)).toBe(true);
    expect((await call(listQuizzes, req('/api/levelup/quizzes', { user: erin }))).data.quizzes).toEqual([]);
    expect((await call(getQuiz, req(`/api/levelup/quizzes/${quiz.id}`, { user: erin }), { id: quiz.id })).status).toBe(404);
    expect((await call(getQuiz, req(`/api/levelup/quizzes/${quiz.id}?manage=1`, { user: erin }), { id: quiz.id })).status).toBe(403);
  });

  it('refuses to publish invalid edits and accepts valid ones', async () => {
    const { quiz } = await draftQuiz();
    const broken = quiz.questions.map((x, i) => (i === 0 ? { ...x, correctIndex: 9 } : x));
    await call(patchQuiz, req(`/api/levelup/quizzes/${quiz.id}`, { method: 'PATCH', user: admin, body: { questions: broken } }), { id: quiz.id });
    const refused = await call(publish, req(`/api/levelup/quizzes/${quiz.id}/publish`, { method: 'POST', user: admin }), { id: quiz.id });
    expect(refused.status).toBe(422);
    expect(refused.data.error.message).toMatch(/Question 1/);

    const fixed = quiz.questions.map((x, i) => (i === 0 ? { ...x, prompt: 'Edited: who handles Severity 1 escalations first?' } : x));
    const saved = await call(patchQuiz, req(`/api/levelup/quizzes/${quiz.id}`, { method: 'PATCH', user: admin, body: { questions: fixed } }), { id: quiz.id });
    expect(saved.data.quiz.problems).toEqual([]);
    const ok = await call(publish, req(`/api/levelup/quizzes/${quiz.id}/publish`, { method: 'POST', user: admin }), { id: quiz.id });
    expect(ok.data.quiz.status).toBe('PUBLISHED');
  });

  it('blocks edits and regeneration while published', async () => {
    const { quiz } = await draftQuiz();
    await call(publish, req('/x', { method: 'POST', user: admin }), { id: quiz.id });
    expect((await call(patchQuiz, req('/x', { method: 'PATCH', user: admin, body: { title: 'New' } }), { id: quiz.id })).status).toBe(409);
    expect((await call(regenerate, req('/x', { method: 'POST', user: admin, body: {} }), { id: quiz.id })).status).toBe(409);
    await call(unpublish, req('/x', { method: 'POST', user: admin }), { id: quiz.id });
    const regen = await call(regenerate, req('/x', { method: 'POST', user: admin, body: {} }), { id: quiz.id });
    expect(regen.data.quiz).toMatchObject({ status: 'DRAFT', version: 2 });
  });

  it('lets employees take a published quiz without seeing answers, scores it, and keeps attempts private', async () => {
    const { quiz } = await draftQuiz();
    await call(publish, req('/x', { method: 'POST', user: admin }), { id: quiz.id });

    const taking = await call(getQuiz, req(`/api/levelup/quizzes/${quiz.id}`, { user: erin }), { id: quiz.id });
    expect(taking.data.quiz.questions[0].correctIndex).toBeUndefined();
    expect(JSON.stringify(taking.data)).not.toMatch(/explanation|sourceQuote/);

    // Answer the first question right and the rest wrong.
    const answers = Object.fromEntries(quiz.questions.map((x, i) => [x.id, i === 0 ? x.correctIndex : (x.correctIndex + 1) % x.options.length]));
    const sub = await call(submit, req('/x', { method: 'POST', user: erin, body: { answers } }), { id: quiz.id });
    expect(sub.status).toBe(201);
    expect(sub.data.attempt).toMatchObject({ correct: 1, total: 4, score: 25, points: 10, passed: false, answersRevealed: true });
    expect(sub.data.attempt.review[0]).toMatchObject({ correct: true, correctIndex: quiz.questions[0].correctIndex });
    expect(sub.data.attempt.review[0].sourceRef).toBeTruthy();

    const attemptId = sub.data.attempt.id;
    expect((await call(getAttempt, req('/x', { user: erin }), { id: attemptId })).status).toBe(200);
    expect((await call(getAttempt, req('/x', { user: sam }), { id: attemptId })).status).toBe(404);
    expect((await call(getAttempt, req('/x', { user: admin }), { id: attemptId })).status).toBe(200);
    expect((await call(listAttempts, req('/api/levelup/attempts', { user: sam }))).data.attempts).toEqual([]);
    expect((await call(listAttempts, req('/api/levelup/attempts?all=1', { user: admin }))).data.attempts).toHaveLength(1);
  });

  it('hides correct answers when the quiz shows the score only', async () => {
    const { quiz } = await draftQuiz();
    await call(patchQuiz, req('/x', { method: 'PATCH', user: admin, body: { settings: { showAnswers: 'SCORE_ONLY' } } }), { id: quiz.id });
    await call(publish, req('/x', { method: 'POST', user: admin }), { id: quiz.id });
    const sub = await call(submit, req('/x', { method: 'POST', user: erin, body: { answers: {} } }), { id: quiz.id });
    expect(sub.data.attempt.answersRevealed).toBe(false);
    expect(sub.data.attempt.review[0].correctIndex).toBeUndefined();
    expect(sub.data.attempt.review[0].explanation).toBeUndefined();
  });

  it('persists quizzes and attempts across a restart and feeds the dashboard', async () => {
    const { quiz } = await draftQuiz();
    await call(publish, req('/x', { method: 'POST', user: admin }), { id: quiz.id });
    const answers = Object.fromEntries(quiz.questions.map(x => [x.id, x.correctIndex]));
    await call(submit, req('/x', { method: 'POST', user: erin, body: { answers } }), { id: quiz.id });

    _resetCache(); // simulate a server restart: everything is re-read from disk
    const s = (await call(stats, req('/api/levelup/stats', { user: erin }))).data.stats;
    expect(s).toMatchObject({ publishedCount: 1, completedCount: 1, passedCount: 1, progress: 100, points: 40, rank: 1 });
    expect(s.badges.find(b => b.key === 'sharp-shooter').earned).toBe(true);
    expect(s.leaderboard[0]).toMatchObject({ name: 'Erin Employee', isMe: true });
    expect((await call(listAttempts, req('/x', { user: erin }))).data.attempts).toHaveLength(1);
  });

  it('does not record admin previews of drafts', async () => {
    const { quiz } = await draftQuiz();
    const sub = await call(submit, req('/x', { method: 'POST', user: admin, body: { answers: {} } }), { id: quiz.id });
    expect(sub.data.attempt.preview).toBe(true);
    expect((await call(listAttempts, req('/x?all=1', { user: admin }))).data.attempts).toEqual([]);
    expect((await call(submit, req('/x', { method: 'POST', user: erin, body: { answers: {} } }), { id: quiz.id })).status).toBe(404);
  });
});
