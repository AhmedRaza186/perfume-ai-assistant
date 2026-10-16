import { guarded, privateHeaders, PublicError, methodNotAllowed, errorResponse } from '@/server/http';
import { existingCustomerOwner, isAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { parse } from '@/server/validation';
import { z } from 'zod';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const id = parse(z.string().uuid(), (await context.params).id);
    const admin = await isAdmin();
    const owner = admin ? undefined : await existingCustomerOwner();
    const row = (admin ? db().prepare('SELECT bytes,mime FROM recordings WHERE id=? AND expires>?').get(id, Date.now())
      : db().prepare('SELECT bytes,mime FROM recordings WHERE id=? AND owner=? AND expires>?').get(id, owner!, Date.now())) as { bytes: Uint8Array; mime: string } | undefined;
    if (!row) throw new PublicError(404, 'This recording expired or is unavailable. Use its saved transcript.');
    const total = row.bytes.length;
    const headers = { ...privateHeaders, 'Content-Type': row.mime, 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline', 'X-Response-Message': 'Private voice recording is ready for manual playback.' };
    const range = request.headers.get('range');
    if (!range) return new Response(row.bytes as BodyInit, { headers: { ...headers, 'Content-Length': String(total) } });
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    const start = match ? Number(match[1]) : -1; const end = match?.[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start < 0 || start >= total || start > end) {
      const response = errorResponse(new PublicError(416, 'The requested recording range is invalid.'));
      response.headers.set('Content-Range', `bytes */${total}`); return response;
    }
    return new Response(row.bytes.slice(start, end + 1) as BodyInit, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) } });
  });
}
export const POST = () => methodNotAllowed(['GET']);
export const PUT = () => methodNotAllowed(['GET']);
export const PATCH = () => methodNotAllowed(['GET']);
export const DELETE = () => methodNotAllowed(['GET']);
export const OPTIONS = () => methodNotAllowed(['GET']);
