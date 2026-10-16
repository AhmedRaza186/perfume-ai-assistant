import { randomUUID } from 'node:crypto';
import { db, products, policies, transaction } from './db';
import { hash, PublicError } from './http';
import { orderDetailsSchema, parse } from './validation';
import type { Product } from '@/types/product';
import type { OrderDetails, OrderDraft, OrderRequest } from '@/types/workflow';

export function productSummary(product: Product) {
  const { id, name, size, price, description, image, notes, families, useGuidance, inStock, dataSource } = product;
  return { id, name, size, price, description, image, notes, families, useGuidance, inStock, dataSource };
}
export async function paymentMethods() {
  const payment = (await policies()).payment;
  const methods = payment.onlineMethods.filter(m => !/\bcod\b|cash on delivery/i.test(m));
  return [...new Set([...(payment.codAvailable ? ['Cash on Delivery (COD)'] : []), ...methods])];
}
export async function validateDetails(input: unknown) {
  const details = parse(orderDetailsSchema, input);
  if (details.productId && !(await products()).some(p => p.id === details.productId)) throw new PublicError(400, 'Choose a product from the current catalogue.');
  if (details.paymentMethod && !(await paymentMethods()).includes(details.paymentMethod)) throw new PublicError(400, 'That payment preference is not supported. Choose one of the current store payment options.');
  return details;
}
type DraftRow = { id: string; value: string; revision: number; reviewed_token: string | null };
export async function orderDraft(conversation: string): Promise<OrderDraft | undefined> {
  const row = await db().prepare('SELECT * FROM order_drafts WHERE conversation=?').get<DraftRow>(conversation);
  if (!row) return;
  const details: OrderDetails = JSON.parse(row.value);
  const [catalogue, rulesSource, methods] = [await products(), await policies(), await paymentMethods()];
  const product = catalogue.find(p => p.id === details.productId);
  const missing = (['productId', 'quantity', 'customerName', 'phone', 'address', 'city', 'paymentMethod'] as const).filter(key => !details[key]);
  if (details.productId && !product) missing.push('productId');
  const validPayment = !!details.paymentMethod && methods.includes(details.paymentMethod);
  if (details.paymentMethod && !validPayment) missing.push('paymentMethod');
  const subtotal = product && details.quantity ? Math.round(product.price * 100) * details.quantity / 100 : null;
  const city = details.city?.trim().toLocaleLowerCase();
  const rules = rulesSource.delivery.rules || [];
  const rule = city ? rules.find(r => r.cities.some(c => c.trim().toLocaleLowerCase() === city)) || rules.find(r => r.cities.includes('*')) : undefined;
  const deliveryCharge = rule && subtotal !== null ? (rule.freeAbove !== undefined && subtotal >= rule.freeAbove ? 0 : rule.charge) : null;
  const total = subtotal !== null && deliveryCharge !== null ? subtotal + deliveryCharge : null;
  const eligibility = product?.inStock === false ? 'Currently unavailable. Choose another product.'
    : !rule || product?.inStock === null ? 'Availability or delivery eligibility/charges pending team confirmation.'
    : 'Recorded availability and delivery rule apply; the team will review this request.';
  const summary = { id: row.id, revision: row.revision, ...details, missing: [...new Set(missing)], product: product ? productSummary(product) : undefined,
    subtotal, deliveryCharge, total, eligibility, ready: missing.length === 0 && product?.inStock !== false && !!product && validPayment };
  const saved = await db().prepare('SELECT value FROM order_requests WHERE draft=?').get<{ value: string }>(row.id);
  if (saved) {
    const request = JSON.parse(saved.value) as OrderRequest;
    return { ...summary, product: request.product, subtotal: request.subtotal, deliveryCharge: request.deliveryCharge,
      total: request.total, eligibility: request.eligibility, ready: true, quoteToken: hash(JSON.stringify(request.details)),
      submittedReference: request.reference, requestStatus: request.status };
  }
  return { ...summary, quoteToken: hash(JSON.stringify(summary)) };
}
export async function patchDraft(conversation: string, patch: unknown, expectedRevision?: number) {
  const details = await validateDetails(patch);
  return transaction(async () => {
    const previous = await orderDraft(conversation);
    if (previous?.submittedReference) throw new PublicError(409, 'This request was already submitted. Start a new conversation for another request.');
    if (expectedRevision !== undefined && expectedRevision !== (previous?.revision || 0)) throw new PublicError(409, 'Order details changed. Reload the summary before editing.');
    const old = await db().prepare('SELECT value FROM order_drafts WHERE conversation=?').get<{ value: string }>(conversation);
    const merged = { ...(old ? JSON.parse(old.value) : {}), ...details };
    if (old && JSON.stringify(merged) === old.value) return (await orderDraft(conversation))!;
    await db().prepare(`INSERT INTO order_drafts (id,conversation,value,revision,reviewed_token) VALUES (?,?,?,1,NULL)
      ON CONFLICT(conversation) DO UPDATE SET value=excluded.value,revision=order_drafts.revision+1,reviewed_token=NULL`)
      .run(previous?.id || randomUUID(), conversation, JSON.stringify(merged));
    return (await orderDraft(conversation))!;
  });
}
export async function markDraftPresented(conversation: string) {
  const draft = await orderDraft(conversation);
  if (draft) await db().prepare('UPDATE order_drafts SET reviewed_token=? WHERE conversation=?').run(draft.quoteToken, conversation);
  return draft;
}
export async function submitDraft(conversation: string, quoteToken: string, confirmed: boolean): Promise<OrderRequest> {
  return transaction(async () => {
    const draft = await orderDraft(conversation);
    if (!draft) throw new PublicError(400, 'Start an order request and review the summary first.');
    // One submission per draft, including confirmations with new request IDs.
    const saved = await db().prepare('SELECT value FROM order_requests WHERE draft=?').get<{ value: string }>(draft.id);
    if (saved) return JSON.parse(saved.value);
    if (!confirmed) throw new PublicError(400, 'Explicit confirmation is required to submit an order request.');
    if (quoteToken !== draft.quoteToken) throw new PublicError(409, 'Prices, policies or order details changed. Review the updated summary and confirm again.');
    if (!draft.ready || !draft.product || draft.subtotal === null) throw new PublicError(400, 'Complete the missing order details and choose an available product and supported payment option.');
    const id = randomUUID();
    const { productId, quantity, customerName, phone, address, city, paymentMethod } = draft;
    const request: OrderRequest = { id, reference: `PR-${id.replace(/-/g, '').toUpperCase()}`, draftId: draft.id, conversationId: conversation,
      details: { productId, quantity, customerName, phone, address, city, paymentMethod }, product: draft.product,
      subtotal: draft.subtotal, deliveryCharge: draft.deliveryCharge, total: draft.total, eligibility: draft.eligibility,
      status: 'New', notes: '', created: Date.now(), revision: 0 };
    await db().prepare('INSERT INTO order_requests VALUES (?,?,?,?)').run(id, draft.id, conversation, JSON.stringify(request));
    return request;
  });
}
export async function confirmInChat(conversation: string, text: string) {
  if (!/^(?:confirm (?:my )?order request|submit (?:my )?order request|order request confirm(?: hai)?|order request bhej do|آرڈر کی درخواست جمع کریں|آرڈر کی درخواست کنفرم ہے)[.!\s]*$/i.test(text.trim())) return;
  const row = await db().prepare('SELECT reviewed_token FROM order_drafts WHERE conversation=?').get<{ reviewed_token: string | null }>(conversation);
  if (!row?.reviewed_token) throw new PublicError(400, 'Please review your editable order summary before explicitly confirming the order request.');
  return submitDraft(conversation, row.reviewed_token, true);
}
export const orderReceived = 'Order request receive ho gayi hai. Team availability aur delivery details confirm karegi.';
export async function orderRequests(conversation?: string): Promise<OrderRequest[]> {
  const rows = conversation ? await db().prepare('SELECT value FROM order_requests WHERE conversation=? ORDER BY seq DESC').all<{ value: string }>(conversation)
    : await db().prepare('SELECT value FROM order_requests ORDER BY seq DESC LIMIT 200').all<{ value: string }>();
  return rows.map(row => JSON.parse(row.value));
}
