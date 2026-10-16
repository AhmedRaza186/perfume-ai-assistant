import { createHash } from 'node:crypto';
import { db, cleanup } from './db';

export class PublicError extends Error {
  constructor(public status: number, message: string, public code = errorCodes[status] || 'request_failed', public details?: { field: string; message: string }[]) { super(message); }
}
const errorCodes: Record<number, string> = { 400: 'invalid_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 405: 'method_not_allowed', 409: 'conflict', 413: 'request_too_large', 415: 'unsupported_format', 416: 'invalid_audio_range', 422: 'invalid_recording', 429: 'rate_limit', 503: 'unavailable' };
export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export function json(value: unknown, status = 200, message = 'Request completed successfully.') {
  const payload = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : { data: value };
  return Response.json({ ...payload, success: true, message }, { status, headers: { ...privateHeaders, 'X-Response-Message': message } });
}
export function errorResponse(error: unknown) {
  const failure = error instanceof PublicError ? error : new PublicError(503, 'The server could not complete your request. Please try again shortly. If the problem continues, contact the store administrator.');
  return Response.json({ success: false, message: failure.message, error: failure.message, code: failure.code, ...(failure.details ? { details: failure.details } : {}) }, {
    status: failure.status, headers: { ...privateHeaders, 'X-Response-Message': encodeURIComponent(failure.message), ...(failure.status === 429 ? { 'Retry-After': '60' } : {}) },
  });
}
export function methodNotAllowed(allowed: string[]) {
  const response = errorResponse(new PublicError(405, `This endpoint accepts ${allowed.join(' or ')} requests. Use one of those methods and try again.`));
  response.headers.set('Allow', allowed.join(', '));
  return response;
}
export async function guarded(fn: () => Promise<Response>) {
  try { await cleanup(); return await fn(); } catch (error) { return errorResponse(error); }
}
/** APP_ORIGIN (comma-separated) plus the deployment, branch and production URLs Vercel exposes at runtime. */
export function configuredOrigins() {
  const vercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host => `https://${host}`);
  return [...(process.env.APP_ORIGIN || '').split(','), ...vercel].map(origin => origin.trim().replace(/\/+$/, '')).filter(Boolean);
}
export function sameOrigin(request: Request) {
  const url = new URL(request.url);
  const configured = configuredOrigins();
  const allowed = configured.length ? configured : ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? [url.origin] : [];
  if (!allowed.includes(request.headers.get('origin') || '')) throw new PublicError(403, 'Request origin is not allowed. Send this request from the store website using the configured APP_ORIGIN.', 'origin_not_allowed');
}
export async function boundedBody(request: Request, max: number): Promise<Uint8Array> {
  if (Number(request.headers.get('content-length')) > max) throw new PublicError(413, 'Request is too large.');
  if (!request.body) throw new PublicError(400, 'Request body is required.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  const timer = setTimeout(() => { void reader.cancel(); }, 15_000);
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.length;
      if (size > max) { await reader.cancel(); throw new PublicError(413, 'Request is too large.'); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function readJson(request: Request, max = 32_000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new PublicError(415, 'Send a JSON body with Content-Type: application/json.');
  try { return JSON.parse(Buffer.from(await boundedBody(request, max)).toString()); }
  catch (error) { if (error instanceof PublicError) throw error; throw new PublicError(400, 'The request body is not valid JSON. Check its commas, quotes and braces, then try again.'); }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function limit(key: string, max: number, period = 60_000) {
  const now = Date.now();
  const row = (await db().prepare(`INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN limits.expires<=? THEN 1 ELSE limits.count+1 END,
    expires=CASE WHEN limits.expires<=? THEN excluded.expires ELSE limits.expires END RETURNING count`).get<{ count: number }>(key, now + period, now, now))!;
  if (row.count > max) throw new PublicError(429, 'Too many requests. Please wait and try again.', 'rate_limit');
}
export async function publicLimit(request: Request, scope: string, max: number) {
  // A single-process demo uses a global ceiling. Forwarded IPs are trusted only behind an explicitly configured proxy.
  await limit(`global:${scope}`, max * 5);
  const ip = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : 'local';
  await limit(`${scope}:${hash(ip || 'unknown')}`, max);
}
