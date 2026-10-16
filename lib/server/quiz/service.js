// Quiz lifecycle (generate -> review/edit -> publish), taking, scoring and history.
// Correct answers never leave the server except to admins, or to a learner after they
// submit and only when the quiz shows answers.
import { v4 as uuidv4 } from 'uuid';

import { isAdmin } from '@/lib/access';
import { DEFAULT_QUIZ_SETTINGS, POINTS_PER_CORRECT, QUESTION_TYPES, QUIZ_STATUS, SHOW_ANSWERS, sourceRef } from '@/lib/levelup';
import { audit } from '@/lib/server/audit';
import { readySections } from '@/lib/server/documents/service';
import { readContent } from '@/lib/server/files';
import { HttpError, badRequest, notFound } from '@/lib/server/http';
import { generateQuestions } from '@/lib/server/quiz/generator';
import { normaliseSettings, quizProblems } from '@/lib/quiz-validation';
import { deleteOne, findAll, findOne, insertOne, updateOne } from '@/lib/server/store';

const autoPublish = () => process.env.QUIZ_AUTO_PUBLISH === 'true';

const summary = (q) => ({
  id: q.id, title: q.title, description: q.description, status: q.status,
  difficulty: q.settings.difficulty, questionCount: q.questions.length,
  documentId: q.documentId, documentTitle: q.documentTitle,
  showAnswers: q.settings.showAnswers, passMark: q.settings.passMark,
  publishedAt: q.publishedAt || null, updatedAt: q.updatedAt, createdAt: q.createdAt,
});

// Full quiz for admin review, with problems flagged and source references resolved.
async function adminView(q) {
  const sections = (await readContent(q.documentId))?.sections || [];
  const byId = new Map(sections.map(s => [s.id, s]));
  return {
    ...summary(q),
    settings: q.settings, generator: q.generator, notice: q.notice || null, version: q.version,
    createdByName: q.createdByName, publishedByName: q.publishedByName || null,
    questions: q.questions.map(x => ({ ...x, sourceRef: sourceRef(byId.get(x.sourceSectionId)) })),
    sections: sections.map(s => ({ id: s.id, ref: sourceRef(s) })),
    problems: quizProblems(q.questions, sections.map(s => s.id)),
  };
}

async function getQuiz(id) {
  const q = await findOne('quizzes', id);
  if (!q) throw notFound('Quiz not found.');
  return q;
}

function assertEditable(q) {
  if (q.status === QUIZ_STATUS.PUBLISHED) throw new HttpError(409, 'Unpublish the quiz before changing it, so learners never see a half-edited quiz.', 'PUBLISHED');
}

// ---- admin: lifecycle ----

export async function createQuizFromDocument(user, documentId, { title, description, settings: input }) {
  const { doc, sections } = await readySections(documentId);
  const settings = normaliseSettings(input, DEFAULT_QUIZ_SETTINGS);
  const { questions, generator, notice } = await generateQuestions(sections, settings, Date.now() % 100000);
  const now = new Date().toISOString();
  const publish = autoPublish() && !quizProblems(questions, sections.map(s => s.id)).length;
  const quiz = await insertOne('quizzes', {
    id: uuidv4(), title: title || `${doc.title} quiz`, description: description || doc.description || '',
    documentId: doc.id, documentTitle: doc.title,
    status: publish ? QUIZ_STATUS.PUBLISHED : QUIZ_STATUS.DRAFT,
    settings, generator, notice, questions, version: 1,
    createdById: user.id, createdByName: user.name, createdAt: now, updatedAt: now,
    ...(publish ? { publishedAt: now, publishedByName: 'Auto-publish' } : {}),
  });
  await audit(user, 'quiz.generated', 'quiz', quiz.id, `${questions.length} questions (${generator}) from ${doc.filename}`);
  return adminView(quiz);
}

export async function regenerateQuiz(user, id, { settings: input } = {}) {
  const q = await getQuiz(id);
  assertEditable(q);
  const { sections } = await readySections(q.documentId);
  const settings = normaliseSettings(input, q.settings);
  const { questions, generator, notice } = await generateQuestions(sections, settings, (q.version * 7919 + Date.now()) % 100000);
  const updated = await updateOne('quizzes', id, {
    settings, generator, notice, questions, status: QUIZ_STATUS.DRAFT,
    version: q.version + 1, updatedAt: new Date().toISOString(),
  });
  await audit(user, 'quiz.regenerated', 'quiz', id, `v${updated.version}: ${questions.length} questions (${generator})`);
  return adminView(updated);
}

// Saves admin edits. Questions keep their source section; new questions must name one.
export async function updateQuiz(user, id, body) {
  const q = await getQuiz(id);
  assertEditable(q);
  const patch = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title || title.length > 150) throw badRequest('Title must be 1 to 150 characters.');
    patch.title = title;
  }
  if (body.description !== undefined) patch.description = String(body.description).trim().slice(0, 1000);
  if (body.settings) {
    // Only display settings change here; question count etc. change through regenerate.
    const s = normaliseSettings({ ...q.settings, showAnswers: body.settings.showAnswers, passMark: body.settings.passMark, difficulty: body.settings.difficulty });
    patch.settings = { ...q.settings, showAnswers: s.showAnswers, passMark: s.passMark, difficulty: s.difficulty };
  }
  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions) || body.questions.length > 50) throw badRequest('questions must be a list of up to 50 questions.');
    patch.questions = body.questions.map(x => ({
      id: typeof x.id === 'string' && x.id ? x.id : uuidv4(),
      type: x.type === QUESTION_TYPES.TRUE_FALSE ? QUESTION_TYPES.TRUE_FALSE : QUESTION_TYPES.MULTIPLE_CHOICE,
      prompt: String(x.prompt ?? '').trim(),
      options: x.type === QUESTION_TYPES.TRUE_FALSE ? ['True', 'False'] : (Array.isArray(x.options) ? x.options : []).map(o => String(o ?? '').trim()),
      correctIndex: Number.isInteger(x.correctIndex) ? x.correctIndex : -1,
      explanation: String(x.explanation ?? '').trim(),
      sourceSectionId: typeof x.sourceSectionId === 'string' ? x.sourceSectionId : '',
      sourceQuote: typeof x.sourceQuote === 'string' ? x.sourceQuote.slice(0, 1000) : '',
    }));
    patch.version = q.version + 1;
  }
  const updated = await updateOne('quizzes', id, patch);
  await audit(user, 'quiz.edited', 'quiz', id, Object.keys(patch).filter(k => k !== 'updatedAt').join(', '));
  // Saving drafts with problems is allowed; publish refuses them.
  return adminView(updated);
}

export async function publishQuiz(user, id) {
  const q = await getQuiz(id);
  const { sections } = await readySections(q.documentId);
  const problems = quizProblems(q.questions, sections.map(s => s.id));
  if (problems.length) {
    const first = problems[0];
    throw new HttpError(422, `Fix ${problems.length} problem${problems.length > 1 ? 's' : ''} before publishing. ${first.index >= 0 ? `Question ${first.index + 1}: ` : ''}${first.problems[0]}`, 'INVALID_QUIZ');
  }
  const updated = await updateOne('quizzes', id, { status: QUIZ_STATUS.PUBLISHED, publishedAt: new Date().toISOString(), publishedByName: user.name, updatedAt: new Date().toISOString() });
  await audit(user, 'quiz.published', 'quiz', id, `${q.questions.length} questions`);
  return adminView(updated);
}

export async function unpublishQuiz(user, id) {
  await getQuiz(id);
  const updated = await updateOne('quizzes', id, { status: QUIZ_STATUS.UNPUBLISHED, updatedAt: new Date().toISOString() });
  await audit(user, 'quiz.unpublished', 'quiz', id);
  return adminView(updated);
}

export async function deleteQuiz(user, id) {
  const q = await getQuiz(id);
  await deleteOne('quizzes', id);
  await audit(user, 'quiz.deleted', 'quiz', id, q.title);
  return { ok: true };
}

export const getQuizForAdmin = async (id) => adminView(await getQuiz(id));

// ---- everyone ----

export async function listQuizzes(user) {
  return (await findAll('quizzes', q => isAdmin(user) || q.status === QUIZ_STATUS.PUBLISHED))
    .sort((a, b) => (b.publishedAt || b.updatedAt).localeCompare(a.publishedAt || a.updatedAt))
    .map(summary);
}

// Questions without answers. Admins may preview unpublished quizzes.
export async function getQuizForTaking(user, id) {
  const q = await findOne('quizzes', id);
  if (!q || (q.status !== QUIZ_STATUS.PUBLISHED && !isAdmin(user))) throw notFound('Quiz not found.');
  return {
    ...summary(q),
    preview: q.status !== QUIZ_STATUS.PUBLISHED,
    questions: q.questions.map(x => ({ id: x.id, type: x.type, prompt: x.prompt, options: x.options })),
  };
}

// answers: { [questionId]: optionIndex }. Unanswered questions count as wrong.
export function scoreAnswers(questions, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw badRequest('answers must be an object of questionId -> option index.');
  const ids = new Set(questions.map(q => q.id));
  for (const [qid, v] of Object.entries(answers)) {
    if (!ids.has(qid)) throw badRequest('answers contains a question that is not in this quiz.');
    if (v !== null && !Number.isInteger(v)) throw badRequest('Each answer must be an option index.');
  }
  const results = questions.map(q => {
    const chosen = Number.isInteger(answers[q.id]) && answers[q.id] >= 0 && answers[q.id] < q.options.length ? answers[q.id] : null;
    return { questionId: q.id, chosen, correct: chosen === q.correctIndex };
  });
  const correct = results.filter(r => r.correct).length;
  return { results, correct, total: questions.length, score: Math.round((correct / questions.length) * 100) };
}

// What a learner may see of an attempt, honouring the quiz's answer setting.
function attemptView(a, viewer) {
  const reveal = a.showAnswers === SHOW_ANSWERS.AFTER_SUBMIT || isAdmin(viewer);
  return {
    id: a.id, quizId: a.quizId, quizTitle: a.quizTitle, userName: a.userName,
    correct: a.correct, total: a.total, score: a.score, points: a.points, passed: a.passed, passMark: a.passMark,
    submittedAt: a.submittedAt, answersRevealed: reveal, preview: !!a.preview,
    review: a.review.map(r => ({
      prompt: r.prompt, options: r.options, chosen: r.chosen, correct: r.correct,
      ...(reveal ? { correctIndex: r.correctIndex, explanation: r.explanation, sourceRef: r.sourceRef } : {}),
    })),
  };
}

export async function submitAttempt(user, quizId, answers) {
  const q = await findOne('quizzes', quizId);
  if (!q || (q.status !== QUIZ_STATUS.PUBLISHED && !isAdmin(user))) throw notFound('Quiz not found.');
  const { results, correct, total, score } = scoreAnswers(q.questions, answers);
  const sections = new Map(((await readContent(q.documentId))?.sections || []).map(s => [s.id, s]));
  const preview = q.status !== QUIZ_STATUS.PUBLISHED;
  const attempt = {
    id: uuidv4(), quizId: q.id, quizTitle: q.title, quizVersion: q.version, documentId: q.documentId,
    userId: user.id, userName: user.name,
    correct, total, score, points: correct * POINTS_PER_CORRECT,
    passMark: q.settings.passMark, passed: score >= q.settings.passMark,
    showAnswers: q.settings.showAnswers, submittedAt: new Date().toISOString(), preview,
    // Snapshot, so history stays accurate if the quiz is edited or removed later.
    review: q.questions.map((x, i) => ({
      prompt: x.prompt, options: x.options, chosen: results[i].chosen, correct: results[i].correct,
      correctIndex: x.correctIndex, explanation: x.explanation, sourceRef: sourceRef(sections.get(x.sourceSectionId)),
    })),
  };
  // Admin previews of unpublished quizzes are scored but not recorded.
  if (!preview) {
    await insertOne('attempts', attempt);
    await audit(user, 'quiz.submitted', 'quiz', q.id, `${score}%`);
  }
  return attemptView(attempt, user);
}

export async function getAttempt(user, id) {
  const a = await findOne('attempts', id);
  // Someone else's attempt looks the same as a missing one.
  if (!a || (a.userId !== user.id && !isAdmin(user))) throw notFound('Attempt not found.');
  return attemptView(a, user);
}

const attemptRow = (a) => ({
  id: a.id, quizId: a.quizId, quizTitle: a.quizTitle, userName: a.userName,
  correct: a.correct, total: a.total, score: a.score, points: a.points, passed: a.passed, submittedAt: a.submittedAt,
});

export async function listAttempts(user, { all = false, quizId } = {}) {
  const everyone = all && isAdmin(user);
  return (await findAll('attempts', a => (everyone || a.userId === user.id) && (!quizId || a.quizId === quizId)))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map(attemptRow);
}

// ---- dashboard numbers, all derived from stored attempts ----

function bestByQuiz(attempts) {
  const best = new Map();
  for (const a of attempts) {
    const cur = best.get(a.quizId);
    if (!cur || a.points > cur.points) best.set(a.quizId, a);
  }
  return best;
}

export async function learnerStats(user) {
  const [published, users, allAttempts] = await Promise.all([
    findAll('quizzes', q => q.status === QUIZ_STATUS.PUBLISHED),
    findAll('users', u => !u.disabled),
    findAll('attempts'),
  ]);
  const publishedIds = new Set(published.map(q => q.id));

  const board = users.map(u => {
    const mine = allAttempts.filter(a => a.userId === u.id);
    const best = bestByQuiz(mine);
    return {
      userId: u.id, name: u.name,
      points: [...best.values()].reduce((n, a) => n + a.points, 0),
      passed: [...best.values()].filter(a => a.passed).length,
      attempts: mine.length,
    };
  }).sort((a, b) => b.points - a.points || b.passed - a.passed || a.name.localeCompare(b.name));

  const me = board.find(b => b.userId === user.id) || { points: 0, passed: 0, attempts: 0 };
  const mine = allAttempts.filter(a => a.userId === user.id);
  const best = bestByQuiz(mine);
  const completedPublished = [...best.keys()].filter(id => publishedIds.has(id));
  const passedPublished = completedPublished.filter(id => best.get(id).passed);
  const firstTry = new Map();
  [...mine].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).forEach(a => { if (!firstTry.has(a.quizId)) firstTry.set(a.quizId, a); });

  const badges = [
    { key: 'first-steps', name: 'First Steps', hint: 'Complete your first quiz', earned: mine.length > 0 },
    { key: 'sharp-shooter', name: 'Sharp Shooter', hint: 'Score 100% on a quiz', earned: mine.some(a => a.score === 100) },
    { key: 'quick-study', name: 'Quick Study', hint: 'Pass a quiz on your first try', earned: [...firstTry.values()].some(a => a.passed) },
    { key: 'consistent', name: 'Consistent', hint: 'Pass 3 different quizzes', earned: [...best.values()].filter(a => a.passed).length >= 3 },
    { key: 'persistent', name: 'Persistent', hint: 'Retake a quiz to improve your score', earned: mine.length > best.size },
    { key: 'all-rounder', name: 'All-Rounder', hint: 'Pass every published quiz', earned: published.length > 0 && passedPublished.length === published.length },
  ];

  const rankIndex = board.findIndex(b => b.userId === user.id);
  return {
    publishedCount: published.length,
    completedCount: completedPublished.length,
    passedCount: passedPublished.length,
    progress: published.length ? Math.round((passedPublished.length / published.length) * 100) : 0,
    points: me.points,
    // No rank until you've scored, so a fresh install doesn't show everyone tied at #1.
    rank: me.points > 0 ? rankIndex + 1 : null,
    learners: users.length,
    bestByQuiz: Object.fromEntries([...best.entries()].map(([k, a]) => [k, { score: a.score, passed: a.passed }])),
    badges,
    recent: mine.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5).map(attemptRow),
    leaderboard: board.filter(b => b.points > 0).slice(0, 50).map((b, i) => ({ rank: i + 1, name: b.name, points: b.points, passed: b.passed, isMe: b.userId === user.id })),
  };
}
