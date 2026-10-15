// Offline quiz generator: needs no AI service. Ported from steep's lib/quiz/offline.ts
// and extended to keep each question traceable to its source section, honour the
// option count and difficulty, and optionally write true/false questions.
//
// It picks informative sentences, blanks out the most answer-like word (a number,
// a proper noun or a long term), and builds distractors from elsewhere in the
// document, never from the sentence itself and never near-duplicates of the answer.
import { QUESTION_TYPES } from '@/lib/levelup';

const STOP = new Set(
  'about above after again against also because been before being below between both but could does doing down during each from further have having here how into itself just more most other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your you the and for are was not its our can may use used using one two new'.split(' '),
);

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
};
const rng = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const shuffle = (items, seed) => {
  const a = [...items];
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function splitSentences(text) {
  // Blank lines end a sentence (headings, paragraphs); single newlines are just line wraps (PDFs).
  return (text.replace(/\n{2,}/g, '. ').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [])
    .map((s) => s.trim().replace(/^[.\s]+/, ''))
    .filter(Boolean);
}

function keywordsIn(sentence) {
  const out = [];
  const words = sentence.match(/[A-Za-z][A-Za-z'’-]*|\d[\d,.]*%?/g) ?? [];
  words.forEach((w, i) => {
    const clean = w.replace(/[.,]+$/, '');
    if (i === 0) return; // sentence-initial words are ambiguous (capitalised either way)
    if (/^\d/.test(clean)) out.push({ text: clean, kind: 'number' });
    else if (/^[A-Z][a-z]{2,}/.test(clean) && !STOP.has(clean.toLowerCase())) out.push({ text: clean, kind: 'proper' });
    // Skip likely verbs/adverbs: they make poor, ambiguous blanks.
    else if (clean.length >= 7 && !STOP.has(clean.toLowerCase()) && !/(ed|ing|ly|ies)$/i.test(clean)) out.push({ text: clean, kind: 'term' });
  });
  return out;
}

// Easy quizzes blank concrete facts (numbers, names); hard ones blank concepts.
const RANK = {
  EASY: { number: 3, proper: 2, term: 1 },
  MEDIUM: { number: 3, proper: 2, term: 1 },
  HARD: { term: 3, proper: 2, number: 1 },
};
// Sentence length window per difficulty (words).
const LENGTH = { EASY: [8, 24], MEDIUM: [8, 32], HARD: [12, 40] };

function bestKeyword(sentence, difficulty) {
  const rank = RANK[difficulty] || RANK.MEDIUM;
  return keywordsIn(sentence).sort((a, b) => rank[b.kind] - rank[a.kind] || b.text.length - a.text.length)[0];
}

function numberDistractors(answer, seed) {
  const n = Number(answer.replace(/[,%]/g, ''));
  if (!Number.isFinite(n)) return [];
  const suffix = answer.endsWith('%') ? '%' : '';
  const fmt = (v) => `${Number.isInteger(n) ? v : Number(v.toFixed(1))}${suffix}`;
  const candidates = [n + 1, n - 1, n * 2, Math.round(n / 2), n + 10, n * 10].filter((v) => v !== n && v >= 0);
  return shuffle([...new Set(candidates.map(fmt))], seed);
}

/**
 * sections: [{ id, heading, page, text }]
 * settings: { questionCount, optionCount, difficulty, includeTrueFalse }
 * seed: varies the selection so "regenerate" gives a different quiz.
 * Returns questions: [{ id, type, prompt, options, correctIndex, explanation, sourceSectionId, sourceQuote }]
 */
export function generateOfflineQuestions(sections, settings, seed = 0) {
  const { questionCount: count, optionCount = 4, difficulty = 'MEDIUM', includeTrueFalse = false } = settings;
  const [minWords, maxWords] = LENGTH[difficulty] || LENGTH.MEDIUM;
  const pool = { number: new Set(), proper: new Set(), term: new Set() };
  const usable = [];

  for (const section of sections) {
    for (const sentence of splitSentences(section.text)) {
      for (const k of keywordsIn(sentence)) pool[k.kind].add(k.text);
      const words = sentence.split(/\s+/).length;
      const kw = bestKeyword(sentence, difficulty);
      if (kw && words >= minWords && words <= maxWords) usable.push({ sentence, kw, sectionId: section.id });
    }
  }

  // Spread candidates across the whole document instead of clustering at the start;
  // the seed rotates the starting point so regenerating picks different sentences.
  const want = Math.min(count * 3, usable.length);
  const offset = usable.length ? seed % usable.length : 0;
  const ordered = Array.from({ length: want }, (_, i) => usable[(offset + Math.floor((i * usable.length) / want)) % usable.length]);

  const questions = [];
  const seen = new Set();
  for (const { sentence, kw, sectionId } of ordered) {
    if (questions.length >= count) break;
    if (seen.has(sentence)) continue;
    seen.add(sentence);

    const qSeed = hash(sentence) ^ seed;
    const lower = kw.text.toLowerCase();
    const sentenceLower = sentence.toLowerCase();
    // A distractor must not give the answer away: not already in the sentence, and not a near-duplicate of the answer.
    const stem = (w) => w.toLowerCase().slice(0, 6);
    const ok = (w) =>
      w.toLowerCase() !== lower &&
      !new RegExp(`(?<![a-z0-9])${escapeRe(w.toLowerCase())}(?![a-z0-9])`).test(sentenceLower) &&
      (kw.kind === 'number' || stem(w) !== stem(kw.text));
    let distractors = [...pool[kw.kind]].filter(ok);
    if (kw.kind === 'number') distractors = [...numberDistractors(kw.text, qSeed), ...distractors];
    distractors = shuffle([...new Set(distractors)], qSeed);
    // Harder quizzes use distractors close in shape to the answer, so it can't be spotted by length.
    if (difficulty !== 'EASY') distractors.sort((a, b) => Math.abs(a.length - kw.text.length) - Math.abs(b.length - kw.text.length));
    const need = optionCount - 1;
    distractors = distractors.slice(0, need);
    if (distractors.length < need) {
      const extra = shuffle([...pool.term, ...pool.proper].filter((w) => ok(w) && !distractors.includes(w)), qSeed);
      distractors = [...distractors, ...extra].slice(0, need);
    }
    distractors = distractors.filter((w, i, all) => kw.kind === 'number' || all.findIndex((x) => stem(x) === stem(w)) === i);
    if (distractors.length < need) continue;

    const blankRe = new RegExp(`(?<![A-Za-z0-9])${escapeRe(kw.text)}(?![A-Za-z0-9])`);
    const blanked = sentence.replace(blankRe, '_____');
    if (blanked === sentence) continue;
    const clean = (s) => s.replace(/([.!?])\.+$/, '$1');

    // Every third question becomes true/false when enabled.
    if (includeTrueFalse && questions.length % 3 === 2) {
      const isTrue = qSeed % 2 === 0;
      const statement = isTrue ? sentence : sentence.replace(blankRe, distractors[0]);
      questions.push({
        type: QUESTION_TYPES.TRUE_FALSE,
        prompt: `True or false: “${clean(statement)}”`,
        options: ['True', 'False'],
        correctIndex: isTrue ? 0 : 1,
        explanation: `The document says: “${sentence}”`,
        sourceSectionId: sectionId,
        sourceQuote: sentence,
      });
      continue;
    }

    const options = shuffle([kw.text, ...distractors], qSeed ^ 0x9e3779b9);
    questions.push({
      type: QUESTION_TYPES.MULTIPLE_CHOICE,
      prompt: `Fill in the blank: “${clean(blanked)}”`,
      options,
      correctIndex: options.indexOf(kw.text),
      explanation: `The document says: “${sentence}”`,
      sourceSectionId: sectionId,
      sourceQuote: sentence,
    });
  }
  return questions;
}
