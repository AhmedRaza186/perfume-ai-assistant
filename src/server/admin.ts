import { db, products, policies, enquiries, readSetting, writeSetting, transaction } from './db';
import { productsSchema, policiesSchema, enquiryUpdateSchema, parse } from './validation';
import { PublicError } from './http';
import { INITIAL_PRODUCTS } from '@/fixtures/products';
import { INITIAL_POLICIES } from '@/fixtures/policies';
import { z } from 'zod';
import type { Enquiry } from '@/types/enquiry';

export async function storeSnapshot() {
  return { products: await products(), policies: await policies(), enquiries: await enquiries(), revision: await readSetting<number>('revision') };
}
export async function updateStore(input: unknown) {
  const { section, data, revision } = parse(z.object({ section: z.enum(['products', 'policies', 'enquiries']), data: z.unknown(), revision: z.number().int().min(0) }), input);
  return transaction(async () => {
    const current = await storeSnapshot();
    if (revision !== current.revision) throw new PublicError(409, 'Store data changed in another session. Reload and try again.');
    if (section === 'products') await writeSetting('products', parse(productsSchema, data));
    if (section === 'policies') await writeSetting('policies', parse(policiesSchema, data));
    if (section === 'enquiries') {
      const updates = parse(z.array(enquiryUpdateSchema).max(500), data);
      for (const update of updates) {
        const row = await db().prepare('SELECT value FROM enquiries WHERE id=?').get<{ value: string }>(update.id);
        if (!row) throw new PublicError(404, 'Enquiry not found.');
        const enquiry = JSON.parse(row.value) as Enquiry;
        await db().prepare('UPDATE enquiries SET value=? WHERE id=?').run(JSON.stringify({ ...enquiry, ...update }), update.id);
      }
    }
    await writeSetting('revision', current.revision + 1);
    return storeSnapshot();
  });
}
export async function resetStore() {
  return transaction(async () => {
    const current = await storeSnapshot();
    if (await db().prepare("SELECT request FROM turns WHERE status='pending' LIMIT 1").get()) throw new PublicError(409, 'Wait for active conversations to finish before resetting.');
    await writeSetting('products', INITIAL_PRODUCTS); await writeSetting('policies', INITIAL_POLICIES);
    for (const table of ['audio', 'recordings', 'enquiries', 'turns', 'human_messages', 'order_drafts', 'order_requests', 'conversations']) await db().exec(`DELETE FROM ${table}`);
    await db().exec('UPDATE customer_preferences SET current_conversation=NULL');
    await writeSetting('revision', current.revision + 1);
    return storeSnapshot();
  });
}
