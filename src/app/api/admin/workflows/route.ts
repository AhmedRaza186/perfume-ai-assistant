import { z } from 'zod';
import { requireAdmin } from '@/server/auth';
import { db, transaction } from '@/server/db';
import { conversation, conversationMessages, setConversationState, sendHumanMessage } from '@/server/conversations';
import { orderDraft, orderRequests } from '@/server/orders';
import { knowledgeEntries, saveKnowledge, deleteKnowledge } from '@/server/knowledge';
import { guarded, json, readJson, sameOrigin, methodNotAllowed, PublicError } from '@/server/http';
import { parse, knowledgeSchema } from '@/server/validation';
import type { OrderRequest } from '@/types/workflow';

const id = z.string().uuid();
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('state'), conversationId: id, state: z.enum(['AI_ACTIVE', 'HUMAN_ACTIVE']) }).strict(),
  z.object({ action: z.literal('message'), conversationId: id, text: z.string().trim().min(1).max(2000), requestId: id }).strict(),
  z.object({ action: z.literal('order'), id, status: z.enum(['New', 'Reviewing', 'Contacted', 'Closed']), notes: z.string().max(2000), revision: z.number().int().min(0) }).strict(),
  z.object({ action: z.literal('knowledge'), entry: knowledgeSchema }).strict(),
  z.object({ action: z.literal('delete-knowledge'), id, revision: z.number().int().min(0) }).strict(),
]);
function snapshot() {
  return { orders: orderRequests(), knowledge: knowledgeEntries(), conversations: db().prepare('SELECT id,state,created FROM conversations ORDER BY created DESC LIMIT 100').all() };
}
export async function GET(request: Request) {
  return guarded(async () => {
    await requireAdmin();
    const raw = new URL(request.url).searchParams.get('id');
    if (raw) {
      const value = parse(id, raw); const row = conversation(value);
      return json({ conversationId: row.id, state: row.state, messages: conversationMessages(row.id), draft: orderDraft(row.id), orders: orderRequests(row.id) }, 200, 'Conversation details were loaded. Private recordings expire after 15 minutes; transcripts remain available.');
    }
    return json(snapshot(), 200, 'Order requests, knowledge and conversations were loaded.');
  });
}
export async function POST(request: Request) {
  return guarded(async () => {
    await requireAdmin(); sameOrigin(request);
    const input = parse(actions, await readJson(request));
    if (input.action === 'state') setConversationState(input.conversationId, input.state);
    else if (input.action === 'message') sendHumanMessage(input.conversationId, input.text, input.requestId);
    else if (input.action === 'knowledge') saveKnowledge(input.entry);
    else if (input.action === 'delete-knowledge') deleteKnowledge(input.id, input.revision);
    else transaction(() => {
      const row = db().prepare('SELECT value FROM order_requests WHERE id=?').get(input.id);
      if (!row) throw new PublicError(404, 'This order request was not found.');
      const order: OrderRequest = JSON.parse(String(row.value));
      if (order.revision !== input.revision) throw new PublicError(409, 'This order request changed. Reload before saving.');
      db().prepare('UPDATE order_requests SET value=? WHERE id=?').run(JSON.stringify({ ...order, status: input.status, notes: input.notes, revision: order.revision + 1 }), input.id);
    });
    return json(snapshot(), 200, 'Your changes were saved successfully.');
  });
}
export const PUT = () => methodNotAllowed(['GET', 'POST']);
export const PATCH = () => methodNotAllowed(['GET', 'POST']);
export const DELETE = () => methodNotAllowed(['GET', 'POST']);
export const OPTIONS = () => methodNotAllowed(['GET', 'POST']);
