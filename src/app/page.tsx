'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { AudioPlayerProvider } from '@/context/AudioPlayerContext';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { EmptyState } from '@/components/chat/EmptyState';
import { ChatMessageItem } from '@/components/chat/ChatMessageItem';
import { ChatComposer } from '@/components/chat/ChatComposer';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { OrderSummary } from '@/components/chat/OrderSummary';
import type { ChatMessage } from '@/types/chat';
import type { ConversationSnapshot, OrderDetails } from '@/types/workflow';
import { assistantService } from '@/services/assistantService';
import { getCurrentTimestamp } from '@/utils/textUtils';

export default function CustomerChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [snapshot, setSnapshot] = useState<ConversationSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const pending = useRef(false);
  const poll = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const voiceInputs = useRef(new Map<string, { audioBlob: Blob; duration: number }>());
  const ownedUrls = useRef<string[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const applySnapshot = useCallback((value: ConversationSnapshot) => {
    if (!mounted.current) return;
    setSnapshot(value);
    setMessages(previous => JSON.stringify(previous) === JSON.stringify(value.messages) ? previous : value.messages);
    setReady(true);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (stopped || document.hidden || pending.current || poll.current) return;
      const controller = new AbortController(); poll.current = controller;
      try { applySnapshot(await assistantService.restore(controller.signal)); }
      catch (failure) { if (!controller.signal.aborted && mounted.current) setError(failure instanceof Error ? failure.message : 'History could not be loaded.'); }
      finally { if (poll.current === controller) poll.current = null; }
    };
    const schedule = async () => {
      await refresh();
      if (!stopped && !document.hidden) timer = setTimeout(schedule, 4000);
    };
    const visibility = () => {
      if (timer) clearTimeout(timer);
      if (document.hidden) { poll.current?.abort(); poll.current = null; }
      else void schedule();
    };
    void schedule(); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; mounted.current = false; if (timer) clearTimeout(timer); poll.current?.abort(); poll.current = null;
      document.removeEventListener('visibilitychange', visibility); ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); };
  }, [applySnapshot]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  function begin() {
    if (pending.current || !ready) return false;
    pending.current = true; poll.current?.abort(); poll.current = null; setBusy(true); setError(''); return true;
  }
  function finish() { pending.current = false; if (mounted.current) setBusy(false); }
  async function action(input: Record<string, unknown>) {
    if (!begin()) return;
    try { applySnapshot(await assistantService.action(input)); }
    catch (failure) { if (input.action !== 'edit-order') setError(failure instanceof Error ? failure.message : 'The change could not be saved.'); throw failure; }
    finally { finish(); }
  }
  const send = async (text?: string, recording?: { audioBlob: Blob; duration: number }, retryId?: string) => {
    if (!begin()) return;
    const id = retryId || crypto.randomUUID();
    if (!retryId) {
      let url: string | undefined;
      if (recording) { url = URL.createObjectURL(recording.audioBlob); ownedUrls.current.push(url); voiceInputs.current.set(id, recording); }
      setMessages(previous => [...previous, { id, sender: 'customer', contentType: recording ? 'voice' : 'text', text,
        audioUrl: url, audioDuration: recording?.duration, timestamp: getCurrentTimestamp() }]);
    }
    try {
      if (recording) await assistantService.processVoiceMessage({ audioBlob: recording.audioBlob, audioDurationSeconds: recording.duration, requestId: id });
      else await assistantService.processTextMessage({ query: text || '', requestId: id });
      applySnapshot(await assistantService.restore());
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'The assistant could not process your message.';
      setMessages(previous => [...previous.filter(m => m.id !== `error-${id}`), { id: `error-${id}`, sender: 'system', contentType: 'text',
        isError: true, errorMessage: message, canRetry: true, timestamp: getCurrentTimestamp() }]);
    } finally { finish(); }
  };
  const retry = (id: string) => {
    const customerId = id.replace(/^error-/, ''); const customer = messages.find(m => m.id === customerId);
    if (customer) void send(customer.text || customer.transcript, voiceInputs.current.get(customerId), customerId);
  };
  const editOrder = async (details: OrderDetails) => {
    if (snapshot?.draft && snapshot.conversationId) await action({ action: 'edit-order', conversationId: snapshot.conversationId, revision: snapshot.draft.revision, details });
  };
  return <AudioPlayerProvider><main className="min-h-dvh flex flex-col justify-center items-center p-0 sm:py-6 sm:px-4 bg-[radial-gradient(ellipse_at_top,#eee7da,transparent_70%)] bg-[#f7f5f0]">
    <div className="w-full sm:max-w-[860px] h-dvh sm:h-[90vh] sm:max-h-[920px] flex flex-col bg-[#fcfbf8] sm:rounded-3xl sm:border sm:border-stone-200/90 sm:shadow-[0_20px_70px_-25px_rgba(65,51,30,0.2)] overflow-hidden">
      <ChatHeader hasMessages={messages.length > 0 || !!snapshot?.draft} onNewConversation={() => {
        if (pending.current) return;
        void action({ action: 'new' }).then(() => { ownedUrls.current.forEach(url => URL.revokeObjectURL(url)); ownedUrls.current = []; voiceInputs.current.clear(); }).catch(() => {});
      }} />
      <div className="bg-white/60 border-b border-stone-200/60 px-5 sm:px-7 py-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-stone-600">
        <span>{snapshot?.state === 'HUMAN_ACTIVE' ? 'Store team is handling this conversation' : snapshot?.state === 'HANDOFF_REQUESTED' ? 'Human help requested · A person may reply later' : 'AI assistant · Ask about perfumes and store policies'}</span>
        <div className="flex flex-wrap items-center gap-3">
          <label>Reply format: <select aria-label="Reply format" disabled={busy || !ready} value={snapshot?.replyFormat || 'match'} onChange={e => void action({ action: 'preference', replyFormat: e.target.value }).catch(() => {})} className="bg-transparent border border-stone-200 rounded p-1">
            <option value="match">Match my message</option><option value="text">Text only</option>
          </select></label>
          <button disabled={busy || !ready || snapshot?.state !== 'AI_ACTIVE'} onClick={() => void action({ action: 'handoff', conversationId: snapshot?.conversationId }).catch(() => {})} className="rounded-full border border-stone-200 bg-white px-3 py-2 hover:bg-stone-50 disabled:opacity-40">Talk to a person</button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-red-700 px-4 py-2">{error} <button className="underline" onClick={() => void assistantService.restore().then(value => { applySnapshot(value); setError(''); }).catch(failure => setError(failure.message))}>Reload conversation</button></p>}
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-6 flex flex-col min-w-0">
        {!ready ? <p className="text-xs text-stone-500">Loading your conversation...</p> : messages.length === 0 && !snapshot?.draft ? <EmptyState onSelectSuggestion={text => void send(text)} /> :
          <div className="flex flex-col space-y-1">{messages.map(message => <ChatMessageItem key={message.id} message={message} onRetry={retry} onAskAboutProduct={name => void send(`Mujhe ${name} ke notes aur availability ke baray mein batayein.`)} />)}</div>}
        {snapshot?.draft && <OrderSummary key={`${snapshot.draft.id}-${snapshot.draft.revision}-${snapshot.draft.quoteToken}`} draft={snapshot.draft} catalogue={snapshot.catalogue} paymentMethods={snapshot.paymentMethods}
          disabled={busy || snapshot.state === 'HUMAN_ACTIVE'} onEdit={editOrder} onSubmit={async () => {
            await action({ action: 'submit-order', conversationId: snapshot.conversationId, quoteToken: snapshot.draft!.quoteToken, confirmed: true });
          }} />}
        {busy && <TypingIndicator />}<div ref={bottom} />
      </div>
      <ChatComposer onSendMessage={text => void send(text)} onSendVoiceMessage={(audioBlob, duration) => send(undefined, { audioBlob, duration })} disabled={busy || !ready} />
    </div>
  </main></AudioPlayerProvider>;
}
