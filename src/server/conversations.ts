import { randomUUID } from 'node:crypto';
import { db, products, transaction } from './db';
import { PublicError } from './http';
import { markDraftPresented, orderRequests, paymentMethods } from './orders';
import type { ChatMessage } from '@/types/chat';
import type { AssistantServiceResponse } from '@/types/services';
import type { ConversationSnapshot, ConversationState, ReplyFormat } from '@/types/workflow';
import type { Enquiry } from '@/types/enquiry';

export type ConversationRow = { id: string; owner: string; state: ConversationState; epoch: number; created: number };
export function conversation(id: string, owner?: string): ConversationRow {
  const row = (owner ? db().prepare('SELECT * FROM conversations WHERE id=? AND owner=?').get(id, owner)
    : db().prepare('SELECT * FROM conversations WHERE id=?').get(id)) as ConversationRow | undefined;
  if (!row) throw new PublicError(404, 'Conversation expired. Start a new conversation.');
  return row;
}
export function preferences(owner: string) {
  const current = db().prepare('SELECT current_conversation,reply_format FROM customer_preferences WHERE owner=?').get(owner) as { current_conversation: string | null; reply_format: ReplyFormat } | undefined;
  if (current) return current;
  const legacy = db().prepare('SELECT id FROM conversations WHERE owner=? ORDER BY created DESC LIMIT 1').get(owner);
  db().prepare('INSERT INTO customer_preferences VALUES (?,?,?)').run(owner, legacy?.id || null, 'match');
  return { current_conversation: legacy ? String(legacy.id) : null, reply_format: 'match' as ReplyFormat };
}
export function setCurrent(owner: string, id: string) {
  preferences(owner);
  db().prepare('UPDATE customer_preferences SET current_conversation=? WHERE owner=?').run(id, owner);
}
export function startConversation(owner: string) {
  const id = randomUUID();
  db().prepare('INSERT INTO conversations (id,owner,created) VALUES (?,?,?)').run(id, owner, Date.now());
  setCurrent(owner, id);
  return id;
}
export function replyPreference(owner: string, format: ReplyFormat) {
  preferences(owner);
  db().prepare('UPDATE customer_preferences SET reply_format=? WHERE owner=?').run(format, owner);
}
export function requestHandoff(id: string, query = 'Customer asked to talk to a person.', channel: 'Chat' | 'Voice Note' = 'Chat') {
  const state = conversation(id).state;
  if (state !== 'HUMAN_ACTIVE') db().prepare("UPDATE conversations SET state='HANDOFF_REQUESTED' WHERE id=?").run(id);
  const existing = (db().prepare('SELECT id,value FROM enquiries WHERE conversation=?').all(id) as { id: string; value: string }[])
    .find(row => (JSON.parse(row.value) as Enquiry).status !== 'Resolved');
  if (!existing) {
    const enquiry: Enquiry = { id: randomUUID(), customerName: 'Chat customer', channel, querySnippet: query,
      timestamp: new Date().toISOString(), status: 'Needs Human Follow-up', notes: 'Saved for review. A person may respond later; no notification was sent.' };
    db().prepare('INSERT INTO enquiries VALUES (?,?,?)').run(enquiry.id, id, JSON.stringify(enquiry));
  }
  return conversation(id).state;
}
export function setConversationState(id: string, next: 'AI_ACTIVE' | 'HUMAN_ACTIVE') {
  return transaction(() => {
    conversation(id);
    // Epoch also invalidates a reply if takeover and release happen during the same provider call.
    db().prepare('UPDATE conversations SET state=?,epoch=epoch+1 WHERE id=? AND state<>?').run(next, id, next);
    if (next === 'AI_ACTIVE') {
      const rows = db().prepare('SELECT id,value FROM enquiries WHERE conversation=?').all(id);
      for (const row of rows) db().prepare('UPDATE enquiries SET value=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(String(row.value)), status: 'Resolved' }), row.id);
    }
    return conversation(id).state;
  });
}
export function sendHumanMessage(id: string, text: string, requestId: string) {
  return transaction(() => {
    if (conversation(id).state !== 'HUMAN_ACTIVE') throw new PublicError(409, 'Take over this conversation before sending a human message.');
    const existing = db().prepare('SELECT conversation,text FROM human_messages WHERE request=?').get(requestId);
    if (existing) {
      if (existing.conversation !== id || existing.text !== text) throw new PublicError(409, 'This message identifier was already used.');
      return;
    }
    db().prepare('INSERT INTO human_messages VALUES (?,?,?,?,?)').run(randomUUID(), id, requestId, text, Date.now());
  });
}
export const handoffSaved = 'Your request was saved for the store team. A person may respond here later; no immediate availability is promised.';
export const humanReceipt = 'Your message was saved for the person helping you. They may reply here later.';
export function liveResponse(response: AssistantServiceResponse): AssistantServiceResponse {
  const copy = { ...response };
  if (copy.audioUrl) {
    const id = copy.audioUrl.split('/').at(-1);
    if (!db().prepare('SELECT id FROM audio WHERE id=? AND expires>?').get(id!, Date.now())) {
      delete copy.audioUrl; copy.audioStatus = 'unavailable'; copy.audioUnavailableReason = 'This audio recording has expired. The transcript is still available.';
    }
  }
  return copy;
}
export function conversationMessages(id: string): ChatMessage[] {
  const rows = db().prepare('SELECT request,query,channel,status,response,created,recording FROM turns WHERE conversation=? ORDER BY created,rowid LIMIT 300').all(id);
  const events: { at: number; order: number; message: ChatMessage }[] = [];
  const timestamp = (at: number) => new Date(at).toISOString();
  for (const row of rows) {
    const created = Number(row.created);
    const voice = row.channel === 'Voice Note';
    const recording = row.recording ? db().prepare('SELECT id,duration FROM recordings WHERE id=? AND expires>?').get(row.recording, Date.now()) : undefined;
    events.push({ at: created, order: 0, message: { id: `customer-${row.request}`, sender: 'customer', contentType: voice ? 'voice' : 'text',
      ...(voice ? { transcript: String(row.query) || 'Transcription unavailable.', audioStatus: recording ? 'ready' as const : 'unavailable' as const,
        audioUrl: recording ? `/api/recordings/${recording.id}` : undefined, audioDuration: recording?.duration ? Number(recording.duration) : undefined } : { text: String(row.query) }), timestamp: timestamp(created) } });
    if (row.response && row.status === 'complete') {
      const response = liveResponse(JSON.parse(String(row.response)));
      // Receipts are displayed as system messages, never as an AI/human reply.
      events.push({ at: created, order: 1, message: { id: `reply-${row.request}`, sender: response.responseType === 'receipt' ? 'system' : 'assistant',
        contentType: response.audioStatus ? 'voice' : 'text', text: response.text, transcript: response.audioStatus ? response.text : undefined,
        audioUrl: response.audioUrl, audioDuration: response.audioDuration, audioStatus: response.audioStatus,
        recommendation: response.recommendation, recommendations: response.recommendations, comparison: response.comparison,
        isHumanHelpConfirmation: response.isHumanHelpTriggered, timestamp: timestamp(created) } });
    }
    if (row.status === 'failed') {
      const failure = row.response ? JSON.parse(String(row.response)) as { text?: string } : undefined;
      events.push({ at: created, order: 1, message: { id: `failed-${row.request}`, sender: 'system', contentType: 'text',
        text: failure?.text || 'This message could not be answered. Please send it again.', timestamp: timestamp(created) } });
    }
  }
  for (const row of db().prepare('SELECT id,text,created FROM human_messages WHERE conversation=? ORDER BY created LIMIT 300').all(id))
    events.push({ at: Number(row.created), order: 2, message: { id: String(row.id), sender: 'human', contentType: 'text', text: String(row.text), timestamp: timestamp(Number(row.created)) } });
  return events.sort((a, b) => a.at - b.at || a.order - b.order).map(event => event.message);
}
export function customerSnapshot(owner: string, requestedId?: string): ConversationSnapshot {
  const pref = preferences(owner);
  const id = requestedId || pref.current_conversation;
  const row = id ? conversation(id, owner) : undefined;
  return { conversationId: row?.id, state: row?.state || 'AI_ACTIVE', messages: row ? conversationMessages(row.id) : [],
    replyFormat: pref.reply_format, draft: row ? markDraftPresented(row.id) : undefined, orderRequests: row ? orderRequests(row.id).map(({ ...order }) => ({ ...order, notes: '' })) : [],
    catalogue: products(), paymentMethods: paymentMethods() };
}
export function modelHistory(id: string) {
  const messages = conversationMessages(id).filter(m => m.sender !== 'system');
  return messages.slice(-24).map(message => ({ role: message.sender === 'customer' ? 'user' as const : 'model' as const,
    text: JSON.stringify({ sender: message.sender, text: message.text || message.transcript, recommendation: message.recommendation,
      recommendations: message.recommendations, comparison: message.comparison }) }));
}
