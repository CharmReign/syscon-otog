// Shared Claude client for the AI features (Level Up quiz writing, AS-IS analysis).
// Configured from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN and ANTHROPIC_MODEL.
import Anthropic from '@anthropic-ai/sdk';

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
export const aiModel = () => process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5';

let client;
export const aiClient = () => (client ||= new Anthropic());

// One structured-output request. Returns the parsed JSON object, or throws with a
// message that is safe to show to the user.
export async function structuredRequest({ system, content, schema, effort = 'medium', maxTokens = 16000, timeout = 120_000 }) {
  const response = await aiClient().beta.messages.create({
    model: aiModel(),
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  }, { timeout });

  if (response.stop_reason === 'refusal') throw new Error('The AI declined this request.');
  if (response.stop_reason === 'max_tokens') throw new Error('The AI response was cut off.');
  const text = response.content.find(b => b.type === 'text')?.text;
  return JSON.parse(text || '{}');
}
