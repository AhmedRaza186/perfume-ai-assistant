import { db, products, policies, enquiries, readSetting, writeSetting, transaction } from './db';
import { productsSchema, policiesSchema, enquiryUpdateSchema, parse } from './validation';
import { PublicError } from './http';
import { INITIAL_PRODUCTS } from '@/fixtures/products';
import { INITIAL_POLICIES } from '@/fixtures/policies';
import { z } from 'zod';
import type { Enquiry } from '@/types/enquiry';

export function storeSnapshot() {
  db().prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('revision', '0');
  return { products: products(), policies: policies(), enquiries: enquiries(), revision: readSetting<number>('revision') };
}
export function updateStore(input: unknown) {
  const { section, data, revision } = parse(z.object({ section: z.enum(['products', 'policies', 'enquiries']), data: z.unknown(), revision: z.number().int().min(0) }), input);
  return transaction(() => {
    const current = storeSnapshot();
    if (revision !== current.revision) throw new PublicError(409, 'Store data changed in another session. Reload and try again.');
    if (section === 'products') writeSetting('products', parse(productsSchema, data));
    if (section === 'policies') writeSetting('policies', parse(policiesSchema, data));
    if (section === 'enquiries') {
      const updates = parse(z.array(enquiryUpdateSchema).max(500), data);
      for (const update of updates) {
        const row = db().prepare('SELECT value FROM enquiries WHERE id=?').get(update.id) as { value: string } | undefined;
        if (!row) throw new PublicError(404, 'Enquiry not found.');
        const enquiry = JSON.parse(row.value) as Enquiry;
        db().prepare('UPDATE enquiries SET value=? WHERE id=?').run(JSON.stringify({ ...enquiry, ...update }), update.id);
      }
    }
    writeSetting('revision', current.revision + 1);
    return storeSnapshot();
  });
}
export function resetStore() {
  return transaction(() => {
    const current = storeSnapshot();
    if (db().prepare("SELECT request FROM turns WHERE status='pending' LIMIT 1").get()) throw new PublicError(409, 'Wait for active conversations to finish before resetting.');
    writeSetting('products', INITIAL_PRODUCTS); writeSetting('policies', INITIAL_POLICIES);
    db().exec('DELETE FROM audio; DELETE FROM recordings; DELETE FROM enquiries; DELETE FROM turns; DELETE FROM human_messages; DELETE FROM order_drafts; DELETE FROM order_requests; DELETE FROM conversations; UPDATE customer_preferences SET current_conversation=NULL;');
    writeSetting('revision', current.revision + 1);
    return storeSnapshot();
  });
}
