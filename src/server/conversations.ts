import { randomUUID } from 'node:crypto';
import { db, products, transaction } from './db';
import { PublicError } from './http';
import { markDraftPresented, orderRequests, paymentMethods } from './orders';
import type { ChatMessage } from '@/types/chat';
import type { AssistantServiceResponse } from '@/types/services';
import type { ConversationSnapshot, ConversationState, ReplyFormat } from '@/types/workflow';
import type { Enquiry } from '@/types/enquiry';

export type ConversationRow = { id: string; owner: string; state: ConversationState; epoch: number; created: number };
export async function conversation(id: string, owner?: string): Promise<ConversationRow> {
  const row = owner ? await db().prepare('SELECT * FROM conversations WHERE id=? AND owner=?').get<ConversationRow>(id, owner)
    : await db().prepare('SELECT * FROM conversations WHERE id=?').get<ConversationRow>(id);
  if (!row) throw new PublicError(404, 'Conversation expired. Start a new conversation.');
  return row;
}
export async function preferences(owner: string) {
  const current = await db().prepare('SELECT current_conversation,reply_format FROM customer_preferences WHERE owner=?').get<{ current_conversation: string | null; reply_format: ReplyFormat }>(owner);
  if (current) return current;
  const legacy = await db().prepare('SELECT id FROM conversations WHERE owner=? ORDER BY created DESC LIMIT 1').get<{ id: string }>(owner);
  await db().prepare('INSERT INTO customer_preferences VALUES (?,?,?) ON CONFLICT (owner) DO NOTHING').run(owner, legacy?.id || null, 'match');
  return { current_conversation: legacy ? String(legacy.id) : null, reply_format: 'match' as ReplyFormat };
}
export async function setCurrent(owner: string, id: string) {
  await preferences(owner);
  await db().prepare('UPDATE customer_preferences SET current_conversation=? WHERE owner=?').run(id, owner);
}
export async function startConversation(owner: string) {
  const id = randomUUID();
  await db().prepare('INSERT INTO conversations (id,owner,created) VALUES (?,?,?)').run(id, owner, Date.now());
  await setCurrent(owner, id);
  return id;
}
export async function replyPreference(owner: string, format: ReplyFormat) {
  await preferences(owner);
  await db().prepare('UPDATE customer_preferences SET reply_format=? WHERE owner=?').run(format, owner);
}
export async function requestHandoff(id: string, query = 'Customer asked to talk to a person.', channel: 'Chat' | 'Voice Note' = 'Chat') {
  const state = (await conversation(id)).state;
  if (state !== 'HUMAN_ACTIVE') await db().prepare("UPDATE conversations SET state='HANDOFF_REQUESTED' WHERE id=?").run(id);
  const existing = (await db().prepare('SELECT id,value FROM enquiries WHERE conversation=?').all<{ id: string; value: string }>(id))
    .find(row => (JSON.parse(row.value) as Enquiry).status !== 'Resolved');
  if (!existing) {
    const enquiry: Enquiry = { id: randomUUID(), customerName: 'Chat customer', channel, querySnippet: query,
      timestamp: new Date().toISOString(), status: 'Needs Human Follow-up', notes: 'Saved for review. A person may respond later; no notification was sent.' };
    await db().prepare('INSERT INTO enquiries VALUES (?,?,?)').run(enquiry.id, id, JSON.stringify(enquiry));
  }
  return (await conversation(id)).state;
}
export async function setConversationState(id: string, next: 'AI_ACTIVE' | 'HUMAN_ACTIVE') {
  return transaction(async () => {
    await conversation(id);
    // Epoch also invalidates a reply if takeover and release happen during the same provider call.
    await db().prepare('UPDATE conversations SET state=?,epoch=epoch+1 WHERE id=? AND state<>?').run(next, id, next);
    if (next === 'AI_ACTIVE') {
      const rows = await db().prepare('SELECT id,value FROM enquiries WHERE conversation=?').all<{ id: string; value: string }>(id);
      for (const row of rows) await db().prepare('UPDATE enquiries SET value=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.value), status: 'Resolved' }), row.id);
    }
    return (await conversation(id)).state;
  });
}
export async function sendHumanMessage(id: string, text: string, requestId: string) {
  return transaction(async () => {
    if ((await conversation(id)).state !== 'HUMAN_ACTIVE') throw new PublicError(409, 'Take over this conversation before sending a human message.');
    const existing = await db().prepare('SELECT conversation,text FROM human_messages WHERE request=?').get<{ conversation: string; text: string }>(requestId);
    if (existing) {
      if (existing.conversation !== id || existing.text !== text) throw new PublicError(409, 'This message identifier was already used.');
      return;
    }
    await db().prepare('INSERT INTO human_messages VALUES (?,?,?,?,?)').run(randomUUID(), id, requestId, text, Date.now());
  });
}
export const handoffSaved = 'Your request was saved for the store team. A person may respond here later; no immediate availability is promised.';
export const humanReceipt = 'Your message was saved for the person helping you. They may reply here later.';
export async function liveResponse(response: AssistantServiceResponse): Promise<AssistantServiceResponse> {
  const copy = { ...response };
  if (copy.audioUrl) {
    const id = copy.audioUrl.split('/').at(-1);
    if (!await db().prepare('SELECT id FROM audio WHERE id=? AND expires>?').get(id!, Date.now())) {
      delete copy.audioUrl; copy.audioStatus = 'unavailable'; copy.audioUnavailableReason = 'This audio recording has expired. The transcript is still available.';
    }
  }
  return copy;
}
type TurnRow = { request: string; query: string; channel: string; status: string; response: string | null; created: number; recording: string | null };
export async function conversationMessages(id: string): Promise<ChatMessage[]> {
  const rows = await db().prepare('SELECT request,query,channel,status,response,created,recording FROM turns WHERE conversation=? ORDER BY created,seq LIMIT 300').all<TurnRow>(id);
  const events: { at: number; order: number; message: ChatMessage }[] = [];
  const timestamp = (at: number) => new Date(at).toISOString();
  for (const row of rows) {
    const created = Number(row.created);
    const voice = row.channel === 'Voice Note';
    const recording = row.recording ? await db().prepare('SELECT id,duration FROM recordings WHERE id=? AND expires>?').get<{ id: string; duration: number | null }>(row.recording, Date.now()) : undefined;
    events.push({ at: created, order: 0, message: { id: `customer-${row.request}`, sender: 'customer', contentType: voice ? 'voice' : 'text',
      ...(voice ? { transcript: String(row.query) || 'Transcription unavailable.', audioStatus: recording ? 'ready' as const : 'unavailable' as const,
        audioUrl: recording ? `/api/recordings/${recording.id}` : undefined, audioDuration: recording?.duration ? Number(recording.duration) : undefined } : { text: String(row.query) }), timestamp: timestamp(created) } });
    if (row.response && row.status === 'complete') {
      const response = await liveResponse(JSON.parse(row.response));
      // Receipts are displayed as system messages, never as an AI/human reply.
      events.push({ at: created, order: 1, message: { id: `reply-${row.request}`, sender: response.responseType === 'receipt' ? 'system' : 'assistant',
        contentType: response.audioStatus ? 'voice' : 'text', text: response.text, transcript: response.audioStatus ? response.text : undefined,
        audioUrl: response.audioUrl, audioDuration: response.audioDuration, audioStatus: response.audioStatus,
        recommendation: response.recommendation, recommendations: response.recommendations, comparison: response.comparison,
        isHumanHelpConfirmation: response.isHumanHelpTriggered, timestamp: timestamp(created) } });
    }
    if (row.status === 'failed') {
      const failure = row.response ? JSON.parse(row.response) as { text?: string } : undefined;
      events.push({ at: created, order: 1, message: { id: `failed-${row.request}`, sender: 'system', contentType: 'text',
        text: failure?.text || 'This message could not be answered. Please send it again.', timestamp: timestamp(created) } });
    }
  }
  for (const row of await db().prepare('SELECT id,text,created FROM human_messages WHERE conversation=? ORDER BY created LIMIT 300').all<{ id: string; text: string; created: number }>(id))
    events.push({ at: Number(row.created), order: 2, message: { id: row.id, sender: 'human', contentType: 'text', text: row.text, timestamp: timestamp(Number(row.created)) } });
  return events.sort((a, b) => a.at - b.at || a.order - b.order).map(event => event.message);
}
export async function customerSnapshot(owner: string, requestedId?: string): Promise<ConversationSnapshot> {
  const pref = await preferences(owner);
  const id = requestedId || pref.current_conversation;
  const row = id ? await conversation(id, owner) : undefined;
  return { conversationId: row?.id, state: row?.state || 'AI_ACTIVE', messages: row ? await conversationMessages(row.id) : [],
    replyFormat: pref.reply_format, draft: row ? await markDraftPresented(row.id) : undefined, orderRequests: row ? (await orderRequests(row.id)).map(({ ...order }) => ({ ...order, notes: '' })) : [],
    catalogue: await products(), paymentMethods: await paymentMethods() };
}
export async function modelHistory(id: string) {
  const messages = (await conversationMessages(id)).filter(m => m.sender !== 'system');
  return messages.slice(-24).map(message => ({ role: message.sender === 'customer' ? 'user' as const : 'model' as const,
    text: JSON.stringify({ sender: message.sender, text: message.text || message.transcript, recommendation: message.recommendation,
      recommendations: message.recommendations, comparison: message.comparison }) }));
}
