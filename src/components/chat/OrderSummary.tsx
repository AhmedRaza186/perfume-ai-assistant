'use client';
import { useState } from 'react';
import type { OrderDetails, OrderDraft } from '@/types/workflow';
import type { Product } from '@/types/product';
import { formatPrice } from '@/utils/textUtils';
import { AssistantError } from '@/services/assistantService';
import { Package, ChevronDown, Pencil, Check } from 'lucide-react';

export function OrderSummary({ draft, catalogue, paymentMethods, disabled, onEdit, onSubmit }: {
  draft: OrderDraft; catalogue: Product[]; paymentMethods: string[]; disabled: boolean;
  onEdit: (details: OrderDetails) => Promise<void>; onSubmit: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [details, setDetails] = useState<OrderDetails>({ productId: draft.productId, quantity: draft.quantity,
    customerName: draft.customerName, phone: draft.phone, address: draft.address, city: draft.city, paymentMethod: draft.paymentMethod });
  const input = 'w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm min-w-0 focus:outline-none focus:ring-2 focus:ring-[#c9b690] aria-[invalid=true]:border-red-400';
  function fieldError(key: string) { return errors[key] ? <span id={`order-error-${key}`} role="alert" className="block mt-1 text-xs text-red-700">{errors[key]}</span> : null; }
  return <section aria-label="Order request summary" className="mt-5 border border-[#ded5c5] rounded-2xl bg-white text-sm overflow-hidden shadow-sm">
    <div className="flex items-center gap-3 bg-[#f6f2e9] px-4 py-4"><span className="rounded-xl bg-white p-2 text-[#80643b]"><Package size={20} /></span>
      <div className="flex-1 min-w-0"><h3 className="font-semibold">Order request {draft.submittedReference ? 'received' : 'draft'}</h3><p className="text-xs text-stone-500 mt-0.5">{draft.product?.name || 'Choose your fragrance'} · {draft.quantity || 1} bottle{(draft.quantity || 1) > 1 ? 's' : ''}</p></div>
      <span className="text-[10px] font-medium uppercase tracking-wider rounded-full border border-[#ded5c5] px-2 py-1 text-[#80643b]">{draft.submittedReference ? 'Saved' : 'Review'}</span>
    </div><div className="p-4 space-y-3">
    {draft.submittedReference && <p className="break-all">Reference: {draft.submittedReference}</p>}
    {draft.requestStatus && <p>Request review status: {draft.requestStatus}</p>}
    <div className="flex items-baseline justify-between gap-3"><span className="text-stone-500">Estimated total</span><strong className="text-base">{draft.total === null ? 'Pending' : formatPrice(draft.total)}</strong></div>
    <p className="text-xs text-stone-500">{draft.total === null ? 'Delivery charges need team confirmation. ' : ''}No payment collected.</p>
    <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-1 text-xs text-stone-600 underline underline-offset-4">{expanded ? 'Hide summary' : 'View full summary'}<ChevronDown size={13} className={expanded ? 'rotate-180' : ''} /></button>
    {expanded && <div className="rounded-xl bg-stone-50 p-3 text-xs text-stone-600 space-y-2">
      <p>Customer: {draft.customerName || 'Missing'} · Phone: {draft.phone || 'Missing'}</p>
      <p className="break-words">Delivery: {[draft.address, draft.city].filter(Boolean).join(', ') || 'Missing'}</p>
      <p>Payment preference: {draft.paymentMethod || 'Missing'}</p>
      <p>Products: {draft.subtotal === null ? 'Pending' : formatPrice(draft.subtotal)} · Delivery: {draft.deliveryCharge === null ? 'Pending confirmation' : formatPrice(draft.deliveryCharge)}</p>
      <p>{draft.eligibility}</p>
    </div>}
    {draft.submittedReference ? <p>Order request receive ho gayi hai. Team availability aur delivery details confirm karegi.</p> : <fieldset disabled={disabled} className="space-y-2 min-w-0">
      <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium hover:bg-stone-50" onClick={() => setEditing(!editing)}><Pencil size={13} />{editing ? 'Close editor' : 'Edit request details'}</button>
      {editing && <form noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3" onSubmit={async event => {
        event.preventDefault();
        setSaveError('');
        const values = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined && value !== ''));
        const invalid: Record<string, string> = {};
        if (details.phone && (!/^\+?[0-9 ()-]+$/.test(details.phone) || details.phone.replace(/\D/g, '').length < 7 || details.phone.replace(/\D/g, '').length > 15)) invalid.phone = 'Enter your complete phone number (7–15 digits), e.g. 03001234567.';
        if (details.quantity !== undefined && (!Number.isInteger(details.quantity) || details.quantity < 1 || details.quantity > 100)) invalid.quantity = 'Choose a whole number from 1 to 100.';
        if (details.customerName && details.customerName.trim().length < 2) invalid.customerName = 'Enter a name with at least 2 characters.';
        if (details.address && details.address.trim().length < 5) invalid.address = 'Enter a complete address with at least 5 characters.';
        if (details.city && details.city.trim().length < 2) invalid.city = 'Enter your city name.';
        setErrors(invalid);
        if (Object.keys(invalid).length) { setSaveError('Please correct the highlighted fields.'); return; }
        try { await onEdit(values); setConfirmed(false); setEditing(false); } catch (failure) {
          if (failure instanceof AssistantError && failure.details.length) setErrors(Object.fromEntries(failure.details.map(d => [d.field.split('.').at(-1)!, d.message])));
          setSaveError(failure instanceof Error ? failure.message : 'Your changes could not be saved. Please try again.');
        }
      }}>
        {saveError && <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">{saveError}</p>}
        <label>Product<select aria-label="Order product" className={input} value={details.productId || ''} onChange={e => setDetails({ ...details, productId: e.target.value })}>
          <option value="">Choose product</option>{catalogue.map(p => <option key={p.id} value={p.id}>{p.name} · {formatPrice(p.price)}</option>)}
        </select>{fieldError('productId')}</label>
        <label>Quantity<input aria-invalid={!!errors.quantity} aria-describedby={errors.quantity ? 'order-error-quantity' : undefined} className={input} type="number" min="1" max="100" value={details.quantity ?? ''} onChange={e => setDetails({ ...details, quantity: e.target.value ? Number(e.target.value) : undefined })} />{fieldError('quantity')}</label>
        {(['customerName', 'phone', 'address', 'city'] as const).map(key => <label key={key}>{({ customerName: 'Name', phone: 'Phone', address: 'Address', city: 'City' })[key]}
          <input aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `order-error-${key}` : undefined} type={key === 'phone' ? 'tel' : 'text'} placeholder={key === 'phone' ? '03001234567' : undefined} className={input} autoComplete={key === 'customerName' ? 'name' : key === 'phone' ? 'tel' : key === 'address' ? 'street-address' : 'address-level2'} value={details[key] || ''} maxLength={key === 'address' ? 500 : key === 'city' ? 100 : key === 'phone' ? 25 : 120} onChange={e => { setDetails({ ...details, [key]: e.target.value }); setErrors(previous => ({ ...previous, [key]: '' })); }} />{fieldError(key)}</label>)}
        <label className="sm:col-span-2">Payment preference<select className={input} value={details.paymentMethod || ''} onChange={e => setDetails({ ...details, paymentMethod: e.target.value })}>
          <option value="">Choose supported method</option>{paymentMethods.map(method => <option key={method}>{method}</option>)}
        </select>{fieldError('paymentMethod')}</label>
        <button className="bg-[#343d35] hover:bg-[#465247] text-white rounded-xl py-3 sm:col-span-2 inline-flex justify-center items-center gap-2"><Check size={15} />Save draft changes</button>
      </form>}
      {!editing && <>{!draft.ready && <p className="text-xs text-[#80643b]">Complete your request details before submitting.</p>}<label className="flex items-start gap-2 text-xs text-stone-600 leading-relaxed pt-2"><input type="checkbox" className="mt-0.5 accent-[#343d35]" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed these details and want to submit an order request for team review.</label>
        <button type="button" disabled={!confirmed || !draft.ready} onClick={() => void onSubmit().catch(() => {})} className="bg-[#343d35] text-white rounded-xl px-4 py-3 text-xs font-medium disabled:opacity-40">Submit order request</button></>}
    </fieldset>}
  </div></section>;
}
