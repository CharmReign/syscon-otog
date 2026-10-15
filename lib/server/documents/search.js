// Keyword search over processed documents, section by section, so each hit carries a
// page or heading reference. Used by Level Up materials, the AS-IS Navigator and
// Client Defect Triage's related-knowledge panel.
import { DOC_STATUS, sourceRef } from '@/lib/levelup';
import { readContent } from '@/lib/server/files';
import { findAll } from '@/lib/server/store';

const STOP = new Set('a an and are as at be by for from has have how i in is it of on or that the this to was what when where which who why will with'.split(' '));

export function terms(query) {
  return [...new Set(String(query || '').toLowerCase().match(/[a-z0-9][a-z0-9_.-]*/g) || [])]
    .filter(t => t.length > 1 && !STOP.has(t))
    .slice(0, 12);
}

function snippet(text, tokens, radius = 140) {
  const lower = text.toLowerCase();
  const at = tokens.map(t => lower.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

const count = (haystack, needle) => {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
};

/**
 * Returns [{ documentId, documentTitle, category, sectionId, ref, snippet, score }], best first.
 * Only READY documents are searched. categories narrows the search when given.
 */
export function searchDocuments(query, { categories, limit = 20 } = {}) {
  const tokens = terms(query);
  if (!tokens.length) return [];
  const hits = [];
  for (const doc of findAll('documents', d => d.status === DOC_STATUS.READY && (!categories?.length || categories.includes(d.category)))) {
    const sections = readContent(doc.id)?.sections || [];
    const titleLower = `${doc.title} ${doc.description || ''}`.toLowerCase();
    const titleBoost = tokens.filter(t => titleLower.includes(t)).length * 2;
    for (const s of sections) {
      const lower = `${s.heading || ''} ${s.text}`.toLowerCase();
      const matched = tokens.filter(t => lower.includes(t));
      if (!matched.length) continue;
      // Favour sections matching more distinct terms, then frequency, then title matches.
      const freq = matched.reduce((n, t) => n + Math.min(count(lower, t), 5), 0);
      const score = matched.length * 10 + freq + titleBoost;
      hits.push({
        documentId: doc.id, documentTitle: doc.title, category: doc.category,
        sectionId: s.id, ref: sourceRef(s), snippet: snippet(s.text, matched), score,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
