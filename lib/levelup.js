// Level Up: Product and Support — constants shared by the UI and the server.
// Keep this file free of Node-only imports; client components use it.

export const DOC_STATUS = { PROCESSING: 'PROCESSING', READY: 'READY', FAILED: 'FAILED' };
export const QUIZ_STATUS = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', UNPUBLISHED: 'UNPUBLISHED' };
export const QUESTION_TYPES = { MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', TRUE_FALSE: 'TRUE_FALSE' };
export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
export const DIFFICULTY_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' };

// AFTER_SUBMIT: learners see correct answers and explanations once they submit.
// SCORE_ONLY: learners see their score and which questions they missed, not the answers.
export const SHOW_ANSWERS = { AFTER_SUBMIT: 'AFTER_SUBMIT', SCORE_ONLY: 'SCORE_ONLY' };

export const DOC_CATEGORIES = [
  { value: 'PRODUCT', label: 'Product' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'SYSTEM', label: 'System / AS-IS' },
  { value: 'RELEASE', label: 'Release' },
  { value: 'OTHER', label: 'Other' },
];
export const categoryLabel = (v) => DOC_CATEGORIES.find(c => c.value === v)?.label || 'Other';

export const QUIZ_LIMITS = { minQuestions: 3, maxQuestions: 20, minOptions: 3, maxOptions: 5 };
export const DEFAULT_QUIZ_SETTINGS = {
  questionCount: 5,
  difficulty: 'MEDIUM',
  optionCount: 4,
  includeTrueFalse: false,
  showAnswers: SHOW_ANSWERS.AFTER_SUBMIT,
  passMark: 80,
};

export const POINTS_PER_CORRECT = 10;

// "Page 4 · Escalation rules", "Escalation rules", or "Introduction".
export function sourceRef(section) {
  if (!section) return '';
  const parts = [];
  if (section.page) parts.push(`Page ${section.page}`);
  if (section.heading) parts.push(section.heading);
  return parts.join(' · ') || 'Introduction';
}
