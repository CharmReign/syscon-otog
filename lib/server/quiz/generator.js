// Quiz generation service. Providers share one interface:
//   generate(sections, settings, seed) -> { questions, notice }
// QUIZ_GENERATOR picks one: "auto" (AI when configured, else offline), "ai" or "offline".
// To add another AI vendor, add a provider here; nothing else changes.
import { v4 as uuidv4 } from 'uuid';

import { aiConfigured, generateAiQuestions } from '@/lib/server/quiz/ai';
import { generateOfflineQuestions } from '@/lib/server/quiz/offline';
import { keepValid } from '@/lib/quiz-validation';

const PROVIDERS = {
  ai: {
    name: 'ai',
    label: 'AI (Claude)',
    available: aiConfigured,
    generate: (sections, settings) => generateAiQuestions(sections, settings),
  },
  offline: {
    name: 'offline',
    label: 'Offline (built from the document text)',
    available: () => true,
    generate: (sections, settings, seed) => ({ questions: generateOfflineQuestions(sections, settings, seed), notice: null }),
  },
};

export function activeProvider() {
  const choice = (process.env.QUIZ_GENERATOR || 'auto').toLowerCase();
  if (choice === 'offline') return PROVIDERS.offline;
  if (choice === 'ai' || choice === 'auto') return PROVIDERS.ai.available() ? PROVIDERS.ai : PROVIDERS.offline;
  return PROVIDERS.offline;
}

export const generatorStatus = () => {
  const p = activeProvider();
  return { provider: p.name, label: p.label, aiConfigured: aiConfigured() };
};

export class GenerationError extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
    this.code = 'GENERATION_FAILED';
  }
}

// Returns { questions (with ids), generator, notice }. Questions are validated and de-duplicated.
export async function generateQuestions(sections, settings, seed = 0) {
  const provider = activeProvider();
  const sectionIds = sections.map(s => s.id);
  let result;
  let used = provider;
  let notice = null;

  if (provider.name === 'ai') {
    try {
      result = await provider.generate(sections, settings, seed);
      notice = result.notice;
      if (!keepValid(result.questions, sectionIds).length) throw new Error('no usable questions');
    } catch (e) {
      console.warn('[quiz] AI generation failed, using offline generator:', e?.message);
      used = PROVIDERS.offline;
      notice = "The AI service couldn't produce a usable quiz, so these questions were built offline from the document text.";
      result = null;
    }
  }
  result ??= await PROVIDERS.offline.generate(sections, settings, seed);

  const questions = keepValid(result.questions, sectionIds)
    .slice(0, settings.questionCount)
    .map(q => ({ id: uuidv4(), ...q }));
  if (!questions.length) {
    throw new GenerationError("We couldn't find enough distinct facts in this document to ask about. Try a longer or more detailed document, or fewer answer options.");
  }
  if (questions.length < settings.questionCount) {
    notice = [notice, `Only ${questions.length} of the ${settings.questionCount} requested questions could be written from this document.`].filter(Boolean).join(' ');
  }
  return { questions, generator: used.name, notice };
}
