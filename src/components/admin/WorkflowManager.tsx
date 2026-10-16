'use client';
import { useState, useEffect, useRef } from 'react';
import type { ConversationState, KnowledgeEntry, OrderDraft, OrderRequest, OrderStatus } from '@/types/workflow';
import type { ChatMessage } from '@/types/chat';
import { ChatMessageItem } from '@/components/chat/ChatMessageItem';
import { formatPrice } from '@/utils/textUtils';

type Overview = { orders: OrderRequest[]; knowledge: KnowledgeEntry[]; conversations: { id: string; state: ConversationState; created: number }[] };
type Detail = { conversationId: string; state: ConversationState; messages: ChatMessage[]; draft?: OrderDraft; orders: OrderRequest[] };
async function api<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', signal: signal || AbortSignal.timeout(15000),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
const inputStyle = 'w-full border border-stone-200 rounded-md bg-white p-2 text-xs';
const buttonStyle = 'rounded-md bg-stone-900 text-white px-3 py-2 text-xs disabled:opacity-40';
export function WorkflowManager({ mode }: { mode: 'orders' | 'conversations' | 'knowledge' }) {
  const [overview, setOverview] = useState<Overview>();
  const [selected, setSelected] = useState('');
  const [linkedConversation, setLinkedConversation] = useState('');
  const selectedConversation = mode === 'orders' ? linkedConversation : mode === 'conversations' ? selected : '';
  const [detail, setDetail] = useState<Detail>();
  const [editing, setEditing] = useState<KnowledgeEntry>();
  const [message, setMessage] = useState('');
  const messageAttempt = useRef<{ text: string; id: string } | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const operation = useRef(false); const read = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (stopped || document.hidden || operation.current || read.current) return;
      const controller = new AbortController(); read.current = controller;
      try {
        const data = await api<Overview>('/api/admin/workflows', undefined, controller.signal);
        const conversation = selectedConversation ? await api<Detail>(`/api/admin/workflows?id=${selectedConversation}`, undefined, controller.signal) : undefined;
        if (!controller.signal.aborted && !stopped) { setOverview(data); setDetail(conversation); }
      } catch (failure) { if (!controller.signal.aborted && !stopped) setError(failure instanceof Error ? failure.message : 'Could not load administration.'); }
      finally { if (read.current === controller) read.current = null; }
    };
    const schedule = async () => { await load(); if (!stopped && !document.hidden) timer = setTimeout(schedule, 4000); };
    const visibility = () => { if (timer) clearTimeout(timer); if (document.hidden) { read.current?.abort(); read.current = null; } else void schedule(); };
    void schedule(); document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; alive.current = false; if (timer) clearTimeout(timer); read.current?.abort(); read.current = null; document.removeEventListener('visibilitychange', visibility); };
  }, [selectedConversation]);
  async function mutate(body: unknown) {
    if (operation.current) return false;
    operation.current = true; read.current?.abort(); read.current = null; setBusy(true); setError('');
    try {
      const data = await api<Overview>('/api/admin/workflows', body);
      const conversation = selectedConversation ? await api<Detail>(`/api/admin/workflows?id=${selectedConversation}`) : undefined;
      if (alive.current) { setOverview(data); setDetail(conversation); }
      return true;
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Changes could not be saved.'); return false; }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  if (!overview) return <p className="text-xs text-stone-500" role="status">{error || 'Loading...'}</p>;
  const selectedOrder = overview.orders.find(order => order.id === selected);
  return <section className="space-y-4 min-w-0">
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {mode === 'orders' && <>
      <h2 className="text-sm font-semibold">Order requests · Team review required</h2>
      <p className="text-xs text-stone-500">These are customer requests. No payment, dispatch or automatic order confirmation is implied.</p>
      {overview.orders.length === 0 && <p className="text-xs">No requests yet.</p>}
      <div className="space-y-2">{overview.orders.map(order => <button key={order.id} disabled={busy} onClick={() => { setSelected(order.id); setLinkedConversation(''); setDetail(undefined); }} className="w-full text-left bg-white border border-stone-200 rounded-lg p-3 text-xs break-words">
        <span className="font-medium">{order.product.name} · {order.details.customerName}</span><span className="block">{order.reference} · {order.status} · Products {formatPrice(order.subtotal)}</span>
      </button>)}</div>
      {selectedOrder && <OrderAdmin key={`${selectedOrder.id}-${selectedOrder.revision}`} order={selectedOrder} busy={busy} onSave={mutate} onConversation={() => {
        setLinkedConversation(selectedOrder.conversationId);
      }} />}
    </>}
    {mode === 'conversations' && <>
      <h2 className="text-sm font-semibold">Conversations and human takeover</h2>
      <select aria-label="Select conversation" className={inputStyle} disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setDetail(undefined); }}>
        <option value="">Choose a conversation</option>{overview.conversations.map(row => <option key={row.id} value={row.id}>{new Date(row.created).toLocaleString()} · {row.state} · {row.id.slice(0, 8)}</option>)}
      </select>
    </>}
    {detail && (mode === 'conversations' || mode === 'orders') && <>
      <div className="flex flex-wrap gap-2 items-center text-xs"><span>{detail.state}</span>
        <button disabled={busy || detail.state === 'HUMAN_ACTIVE'} className={buttonStyle} onClick={() => void mutate({ action: 'state', conversationId: detail.conversationId, state: 'HUMAN_ACTIVE' })}>Take over</button>
        <button disabled={busy || detail.state === 'AI_ACTIVE'} className={buttonStyle} onClick={() => void mutate({ action: 'state', conversationId: detail.conversationId, state: 'AI_ACTIVE' })}>Return to AI</button>
      </div>
      <p className="text-xs text-stone-500">Original voice notes and generated replies expire after 15 minutes. After expiry, only the saved transcript is available. Messages are retained for 30 days.</p>
      <div className="bg-white border border-stone-200 rounded-xl p-4 max-h-[480px] overflow-y-auto min-w-0">{detail.messages.map(item => <ChatMessageItem key={item.id} message={item} />)}</div>
      <form onSubmit={async e => {
        e.preventDefault(); if (!message.trim()) return;
        if (messageAttempt.current?.text !== message.trim()) messageAttempt.current = { text: message.trim(), id: crypto.randomUUID() };
        if (await mutate({ action: 'message', conversationId: detail.conversationId, text: message.trim(), requestId: messageAttempt.current.id })) { setMessage(''); messageAttempt.current = null; }
      }} className="flex flex-col sm:flex-row gap-2">
        <textarea aria-label="Human reply" maxLength={2000} placeholder="Reply as the store team" className={inputStyle} value={message} disabled={busy || detail.state !== 'HUMAN_ACTIVE'} onChange={e => setMessage(e.target.value)} />
        <button className={buttonStyle} disabled={busy || detail.state !== 'HUMAN_ACTIVE' || !message.trim()}>Send human reply</button>
      </form>
    </>}
    {mode === 'knowledge' && <>
      <div className="flex justify-between items-center"><h2 className="text-sm font-semibold">Knowledge reference</h2><button className={buttonStyle} disabled={busy} onClick={() => setEditing({ id: crypto.randomUUID(), title: '', content: '', kind: 'FAQ', active: true, revision: 0 })}>Add entry</button></div>
      <p className="text-xs text-stone-500">Catalogue and structured policies take priority. Knowledge supplements them; it cannot override prices, payment or delivery. Up to 20 active entries, 16,000 total characters.</p>
      {editing && <form className="p-4 border border-stone-200 rounded-xl bg-white space-y-3 text-xs" onSubmit={async e => { e.preventDefault(); if (await mutate({ action: 'knowledge', entry: { id: editing.id, title: editing.title, content: editing.content, kind: editing.kind, active: editing.active, revision: editing.revision } })) setEditing(undefined); }}>
        <label className="block">Title<input required maxLength={120} className={inputStyle} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} /></label>
        <label className="block">Type<select className={inputStyle} value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as KnowledgeEntry['kind'] })}>{['FAQ', 'Product guidance', 'Business information'].map(kind => <option key={kind}>{kind}</option>)}</select></label>
        <label className="block">Reference content<textarea required maxLength={2000} rows={5} className={inputStyle} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} /></label>
        <label className="flex gap-2"><input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />Active</label>
        <div className="flex gap-2"><button disabled={busy} className={buttonStyle}>Save entry</button><button type="button" onClick={() => setEditing(undefined)}>Cancel</button></div>
      </form>}
      {overview.knowledge.map(entry => <article key={entry.id} className="p-4 border border-stone-200 rounded-xl bg-white text-xs space-y-2">
        <h3 className="font-semibold">{entry.title} · {entry.kind} · {entry.active ? 'Active' : 'Disabled'}</h3><p className="whitespace-pre-wrap break-words">{entry.content}</p>
        {entry.warnings?.map(warning => <p className="text-amber-800" key={warning}>{warning}</p>)}
        <div className="flex gap-3"><button disabled={busy} className="underline" onClick={() => setEditing(entry)}>Edit</button>
          <button disabled={busy} className="underline" onClick={() => void mutate({ action: 'knowledge', entry: { id: entry.id, title: entry.title, content: entry.content, kind: entry.kind, active: !entry.active, revision: entry.revision } })}>{entry.active ? 'Disable' : 'Enable'}</button>
          <button disabled={busy} className="text-red-700 underline" onClick={() => { if (confirm('Delete this knowledge entry?')) void mutate({ action: 'delete-knowledge', id: entry.id, revision: entry.revision }); }}>Delete</button></div>
      </article>)}
    </>}
  </section>;
}
function OrderAdmin({ order, busy, onSave, onConversation }: { order: OrderRequest; busy: boolean; onSave: (body: unknown) => Promise<boolean>; onConversation: () => void }) {
  const [status, setStatus] = useState<OrderStatus>(order.status); const [notes, setNotes] = useState(order.notes);
  return <form className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 text-xs" onSubmit={e => { e.preventDefault(); void onSave({ action: 'order', id: order.id, revision: order.revision, status, notes }); }}>
    <h3 className="font-semibold break-all">{order.reference}</h3>
    <p>{order.product.name} · {order.product.size} · Quantity {order.details.quantity} · Unit price {formatPrice(order.product.price)}</p>
    <p>{order.details.customerName} · {order.details.phone}</p><p className="break-words">{order.details.address}, {order.details.city}</p>
    <p>Payment preference: {order.details.paymentMethod} · No payment receipt recorded</p>
    <p>Products {formatPrice(order.subtotal)} · Delivery {order.deliveryCharge === null ? 'Pending' : formatPrice(order.deliveryCharge)} · Total {order.total === null ? 'Pending confirmation' : formatPrice(order.total)}</p>
    <p>{order.eligibility}</p>
    <label className="block">Request status<select className={inputStyle} value={status} onChange={e => setStatus(e.target.value as OrderStatus)}>{['New', 'Reviewing', 'Contacted', 'Closed'].map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="block">Internal notes<textarea className={inputStyle} maxLength={2000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    <div className="flex flex-wrap gap-3"><button disabled={busy} className={buttonStyle}>Save request review</button><button type="button" disabled={busy} className="underline" onClick={onConversation}>Open relevant conversation</button></div>
  </form>;
}
