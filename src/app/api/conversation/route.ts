import { z } from 'zod';
import { customerOwner, existingCustomerOwner } from '@/server/auth';
import { conversation, customerSnapshot, startConversation, requestHandoff, replyPreference } from '@/server/conversations';
import { patchDraft, submitDraft, orderReceived } from '@/server/orders';
import { guarded, json, readJson, sameOrigin, publicLimit, methodNotAllowed } from '@/server/http';
import { parse, orderDetailsSchema } from '@/server/validation';

const id = z.string().uuid();
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('new') }).strict(),
  z.object({ action: z.literal('preference'), replyFormat: z.enum(['match', 'text']) }).strict(),
  z.object({ action: z.literal('handoff'), conversationId: id.optional() }).strict(),
  z.object({ action: z.literal('edit-order'), conversationId: id, revision: z.number().int().min(0), details: orderDetailsSchema }).strict(),
  z.object({ action: z.literal('submit-order'), conversationId: id, quoteToken: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict(),
]);
export async function GET(request: Request) {
  return guarded(async () => {
    publicLimit(request, 'history', 40);
    const raw = new URL(request.url).searchParams.get('id');
    const requested = raw ? parse(id, raw) : undefined;
    const owner = requested ? await existingCustomerOwner() : await customerOwner();
    return json(customerSnapshot(owner, requested), 200, 'Your saved conversation and preferences were loaded.');
  });
}
export async function POST(request: Request) {
  return guarded(async () => {
    sameOrigin(request); publicLimit(request, 'workflow', 15);
    const input = parse(actions, await readJson(request));
    const owner = await customerOwner();
    if (input.action === 'new') startConversation(owner);
    else if (input.action === 'preference') replyPreference(owner, input.replyFormat);
    else if (input.action === 'handoff') {
      const current = input.conversationId || customerSnapshot(owner).conversationId || startConversation(owner);
      conversation(current, owner); requestHandoff(current);
    } else {
      const row = conversation(input.conversationId, owner);
      if (row.state === 'HUMAN_ACTIVE') return json(customerSnapshot(owner, row.id), 200, 'A person is helping you. Please send order changes in the conversation for them to review.');
      if (input.action === 'edit-order') patchDraft(row.id, input.details, input.revision);
      else {
        const saved = submitDraft(row.id, input.quoteToken, input.confirmed);
        return json({ ...customerSnapshot(owner, row.id), orderReference: saved.reference, text: orderReceived }, 200, 'Your order request was received for team review.');
      }
      return json(customerSnapshot(owner, row.id), 200, 'Your draft changes were saved. Review the updated summary before submitting.');
    }
    return json(customerSnapshot(owner), 200, 'Your conversation settings were saved.');
  });
}
export const PUT = () => methodNotAllowed(['GET', 'POST']);
export const PATCH = () => methodNotAllowed(['GET', 'POST']);
export const DELETE = () => methodNotAllowed(['GET', 'POST']);
export const OPTIONS = () => methodNotAllowed(['GET', 'POST']);
