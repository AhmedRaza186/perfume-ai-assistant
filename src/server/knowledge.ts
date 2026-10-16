import { db, policies, products, transaction } from './db';
import { parse, knowledgeSchema } from './validation';
import { PublicError } from './http';
import type { KnowledgeEntry } from '@/types/workflow';

function numericWarnings(entry: KnowledgeEntry) {
  const structured = JSON.stringify({ products: products(), policies: policies() });
  const numbers = (value: string) => value.replace(/(?<=\d),(?=\d{3})/g, '').match(/\d+(?:\.\d+)?/g) || [];
  const allowed = new Set(numbers(structured));
  const unexpected = numbers(`${entry.title} ${entry.content}`).filter(number => !allowed.has(number));
  const warnings = unexpected.length ? ['Numeric information differs from structured sources. Verify it before using this entry.'] : [];
  for (const product of products()) {
    if (`${entry.title} ${entry.content}`.toLowerCase().includes(product.name.toLowerCase()) && /price|cost|قیمت|keemat/i.test(entry.content))
      warnings.push('Product pricing belongs in the structured catalogue. This reference cannot override it.');
  }
  return [...new Set(warnings)];
}
export function knowledgeEntries(): KnowledgeEntry[] {
  return db().prepare('SELECT id,value,revision FROM knowledge ORDER BY rowid DESC').all().map(row => {
    const entry = { ...JSON.parse(String(row.value)), id: String(row.id), revision: Number(row.revision) } as KnowledgeEntry;
    return { ...entry, warnings: numericWarnings(entry) };
  });
}
export function activeKnowledge() {
  return knowledgeEntries().filter(entry => entry.active).map(({ title, content, kind, warnings }) => ({ title, content, kind, warnings }));
}
export function saveKnowledge(input: unknown) {
  const entry = parse(knowledgeSchema, input);
  return transaction(() => {
    const previous = db().prepare('SELECT revision FROM knowledge WHERE id=?').get(entry.id);
    if (entry.revision !== (previous?.revision || 0)) throw new PublicError(409, 'This knowledge entry changed. Reload before saving.');
    const entries = knowledgeEntries().filter(e => e.id !== entry.id).concat(entry);
    if (entries.length > 50 || entries.filter(e => e.active).length > 20 || entries.filter(e => e.active).reduce((total, e) => total + e.title.length + e.content.length, 0) > 16000)
      throw new PublicError(400, 'Keep at most 50 entries, 20 active entries, and 16,000 characters of active knowledge.');
    db().prepare('INSERT INTO knowledge VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=knowledge.revision+1')
      .run(entry.id, JSON.stringify({ title: entry.title, content: entry.content, kind: entry.kind, active: entry.active }), 1);
    return knowledgeEntries();
  });
}
export function deleteKnowledge(id: string, revision: number) {
  if (!db().prepare('DELETE FROM knowledge WHERE id=? AND revision=?').run(id, revision).changes) throw new PublicError(409, 'This knowledge entry changed or was deleted. Reload before deleting.');
  return knowledgeEntries();
}
