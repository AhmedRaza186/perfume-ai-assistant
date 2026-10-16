import { db, policies, products, transaction } from './db';
import { parse, knowledgeSchema } from './validation';
import { PublicError } from './http';
import type { KnowledgeEntry } from '@/types/workflow';
import type { Product } from '@/types/product';
import type { StorePolicies } from '@/types/policy';

function numericWarnings(entry: KnowledgeEntry, catalogue: Product[], rules: StorePolicies) {
  const structured = JSON.stringify({ products: catalogue, policies: rules });
  const numbers = (value: string) => value.replace(/(?<=\d),(?=\d{3})/g, '').match(/\d+(?:\.\d+)?/g) || [];
  const allowed = new Set(numbers(structured));
  const unexpected = numbers(`${entry.title} ${entry.content}`).filter(number => !allowed.has(number));
  const warnings = unexpected.length ? ['Numeric information differs from structured sources. Verify it before using this entry.'] : [];
  for (const product of catalogue) {
    if (`${entry.title} ${entry.content}`.toLowerCase().includes(product.name.toLowerCase()) && /price|cost|قیمت|keemat/i.test(entry.content))
      warnings.push('Product pricing belongs in the structured catalogue. This reference cannot override it.');
  }
  return [...new Set(warnings)];
}
export async function knowledgeEntries(): Promise<KnowledgeEntry[]> {
  const [catalogue, rules] = [await products(), await policies()];
  return (await db().prepare('SELECT id,value,revision FROM knowledge ORDER BY seq DESC').all<{ id: string; value: string; revision: number }>()).map(row => {
    const entry = { ...JSON.parse(row.value), id: row.id, revision: Number(row.revision) } as KnowledgeEntry;
    return { ...entry, warnings: numericWarnings(entry, catalogue, rules) };
  });
}
export async function activeKnowledge() {
  return (await knowledgeEntries()).filter(entry => entry.active).map(({ title, content, kind, warnings }) => ({ title, content, kind, warnings }));
}
export async function saveKnowledge(input: unknown) {
  const entry = parse(knowledgeSchema, input);
  return transaction(async () => {
    const previous = await db().prepare('SELECT revision FROM knowledge WHERE id=?').get<{ revision: number }>(entry.id);
    if (entry.revision !== (previous?.revision || 0)) throw new PublicError(409, 'This knowledge entry changed. Reload before saving.');
    const entries = (await knowledgeEntries()).filter(e => e.id !== entry.id).concat(entry);
    if (entries.length > 50 || entries.filter(e => e.active).length > 20 || entries.filter(e => e.active).reduce((total, e) => total + e.title.length + e.content.length, 0) > 16000)
      throw new PublicError(400, 'Keep at most 50 entries, 20 active entries, and 16,000 characters of active knowledge.');
    await db().prepare('INSERT INTO knowledge VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=knowledge.revision+1')
      .run(entry.id, JSON.stringify({ title: entry.title, content: entry.content, kind: entry.kind, active: entry.active }), 1);
    return knowledgeEntries();
  });
}
export async function deleteKnowledge(id: string, revision: number) {
  if (!(await db().prepare('DELETE FROM knowledge WHERE id=? AND revision=?').run(id, revision)).changes) throw new PublicError(409, 'This knowledge entry changed or was deleted. Reload before deleting.');
  return knowledgeEntries();
}
