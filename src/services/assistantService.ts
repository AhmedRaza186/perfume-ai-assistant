import type { IAnswerService, TextQueryRequest, VoiceQueryRequest, AssistantServiceResponse } from '@/types/services';
import type { ConversationSnapshot } from '@/types/workflow';

export class AssistantError extends Error {
  constructor(message: string, public details: { field: string; message: string }[] = []) { super(message); }
}

export class AccessRequiredError extends Error {}

class HttpAssistantService implements IAnswerService {
  private conversationId?: string;
  private attempts = new Map<string, string>();
  resetConversation() { this.conversationId = undefined; this.attempts.clear(); }
  async restore(signal?: AbortSignal): Promise<ConversationSnapshot> {
    const response = await fetch('/api/conversation', { cache: 'no-store', credentials: 'same-origin', signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Conversation could not be loaded.');
    this.conversationId = data.conversationId;
    return data;
  }
  async action(input: Record<string, unknown>): Promise<ConversationSnapshot> {
    const response = await fetch('/api/conversation', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new AssistantError(data.error || 'Your changes could not be saved.', data.details || []);
    this.conversationId = data.conversationId;
    return data;
  }
  private attempt(id?: string) {
    const key = id || crypto.randomUUID();
    if (!this.attempts.has(key)) this.attempts.set(key, crypto.randomUUID());
    return { key, requestId: this.attempts.get(key)! };
  }
  private async send(url: string, init: RequestInit, attemptKey: string): Promise<AssistantServiceResponse> {
    const response = await fetch(url, { ...init, credentials: 'same-origin', signal: AbortSignal.timeout(130_000) });
    const data = await response.json();
    if (!response.ok) {
      // Keep the identifier for requests still in flight or with an uncertain network outcome.
      if (response.status !== 409) this.attempts.delete(attemptKey);
      else if (!String(data.error).includes('still processing')) this.attempts.delete(attemptKey);
      if (data.code === 'access_required') throw new AccessRequiredError(data.error);
      throw new Error(data.error || 'Assistant unavailable. Please retry or type your question.');
    }
    this.attempts.delete(attemptKey);
    this.conversationId = data.conversationId;
    return data;
  }
  async processTextMessage(request: TextQueryRequest) {
    const attempt = this.attempt(request.requestId);
    return this.send('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: request.query, conversationId: this.conversationId, requestId: attempt.requestId }),
    }, attempt.key);
  }
  async processVoiceMessage(request: VoiceQueryRequest) {
    const attempt = this.attempt(request.requestId);
    const form = new FormData();
    const type = request.audioBlob.type.split(';')[0];
    const extension = type === 'audio/mp4' ? 'mp4' : type === 'audio/ogg' ? 'ogg' : 'webm';
    form.set('audio', request.audioBlob, `recording.${extension}`);
    form.set('audioDurationSeconds', String(request.audioDurationSeconds));
    form.set('requestId', attempt.requestId);
    if (this.conversationId) form.set('conversationId', this.conversationId);
    return this.send('/api/voice-query', { method: 'POST', body: form }, attempt.key);
  }
}
export interface ChatAccess { granted: boolean; username: string | null }
async function accessRequest(init?: RequestInit): Promise<ChatAccess> {
  const response = await fetch('/api/access', { ...init, cache: 'no-store', credentials: 'same-origin' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Sign-in failed.');
  return { granted: !!data.granted, username: data.username ?? null };
}
export const accessStatus = () => accessRequest();
export const unlockAccess = (username: string, password: string) => accessRequest({ method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
export const signOutAccess = () => accessRequest({ method: 'DELETE' });
export const assistantService = new HttpAssistantService();

