// Quiz validation, shared by the server (generate, edit, publish) and the review UI (live feedback).
import { DIFFICULTIES, QUESTION_TYPES, QUIZ_LIMITS, SHOW_ANSWERS } from '@/lib/levelup';

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Returns a list of problems for one question; empty when it's valid.
// sectionIds: ids of the source document's sections (traceability check).
export function questionProblems(q, sectionIds) {
  const problems = [];
  if (!q || typeof q !== 'object') return ['Question is missing.'];
  if (!Object.values(QUESTION_TYPES).includes(q.type)) problems.push('Unknown question type.');
  const prompt = typeof q.prompt === 'string' ? q.prompt.trim() : '';
  if (prompt.length < 10) problems.push('Question text must be at least 10 characters.');
  if (prompt.length > 600) problems.push('Question text must be 600 characters or fewer.');

  const options = Array.isArray(q.options) ? q.options : [];
  if (q.type === QUESTION_TYPES.TRUE_FALSE) {
    if (options.length !== 2 || options[0] !== 'True' || options[1] !== 'False') problems.push('True/false questions must have the options True and False.');
  } else {
    if (options.length < 2 || options.length > QUIZ_LIMITS.maxOptions) problems.push(`Multiple-choice questions need 2 to ${QUIZ_LIMITS.maxOptions} options.`);
    if (options.some(o => typeof o !== 'string' || !o.trim())) problems.push('Every option needs text.');
    if (options.some(o => typeof o === 'string' && o.length > 300)) problems.push('Options must be 300 characters or fewer.');
    if (new Set(options.map(norm)).size !== options.length) problems.push('Options must all be different.');
  }
  if (!Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex >= options.length) problems.push('Choose the correct answer.');
  const explanation = typeof q.explanation === 'string' ? q.explanation.trim() : '';
  if (!explanation) problems.push('Add an explanation for the correct answer.');
  if (explanation.length > 1200) problems.push('Explanation must be 1200 characters or fewer.');
  if (!q.sourceSectionId || (sectionIds && !sectionIds.includes(q.sourceSectionId))) problems.push('The question must reference a section of its source document.');
  return problems;
}

// Validates a whole quiz: each question plus duplicates across questions.
// Returns [{ index, problems }] for questions with problems, and quiz-level problems at index -1.
export function quizProblems(questions, sectionIds) {
  const out = [];
  if (!Array.isArray(questions) || !questions.length) return [{ index: -1, problems: ['The quiz has no questions.'] }];
  const seen = new Map();
  questions.forEach((q, i) => {
    const problems = questionProblems(q, sectionIds);
    const key = norm(q?.prompt);
    if (key && seen.has(key)) problems.push(`Duplicate of question ${seen.get(key) + 1}.`);
    else seen.set(key, i);
    if (problems.length) out.push({ index: i, problems });
  });
  return out;
}

// Removes invalid and duplicate questions from generator output.
export function keepValid(questions, sectionIds) {
  const seen = new Set();
  return questions.filter(q => {
    const key = norm(q.prompt);
    if (seen.has(key) || questionProblems(q, sectionIds).length) return false;
    seen.add(key);
    return true;
  });
}

export function normaliseSettings(input = {}, base = {}) {
  const merged = { ...base, ...input };
  const clampInt = (v, min, max, d) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : d);
  return {
    questionCount: clampInt(merged.questionCount, QUIZ_LIMITS.minQuestions, QUIZ_LIMITS.maxQuestions, 5),
    optionCount: clampInt(merged.optionCount, QUIZ_LIMITS.minOptions, QUIZ_LIMITS.maxOptions, 4),
    difficulty: DIFFICULTIES.includes(merged.difficulty) ? merged.difficulty : 'MEDIUM',
    includeTrueFalse: merged.includeTrueFalse === true,
    showAnswers: Object.values(SHOW_ANSWERS).includes(merged.showAnswers) ? merged.showAnswers : SHOW_ANSWERS.AFTER_SUBMIT,
    passMark: clampInt(merged.passMark, 0, 100, 80),
  };
}
