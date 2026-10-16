import { methodNotAllowed } from '@/server/http';
import { guarded, privateHeaders, PublicError, errorResponse } from '@/server/http';
import { existingCustomerOwner, isAdmin } from '@/server/auth';
import { db } from '@/server/db';


export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(async () => {
    const { id } = await context.params;
    const admin = await isAdmin();
    const owner = admin ? undefined : await existingCustomerOwner();
    const row = admin ? await db().prepare('SELECT bytes FROM audio WHERE id=? AND expires>?').get<{ bytes: Uint8Array }>(id, Date.now())
      : await db().prepare('SELECT bytes FROM audio WHERE id=? AND owner=? AND expires>?').get<{ bytes: Uint8Array }>(id, owner!, Date.now());
    if (!row) throw new PublicError(404, 'Audio has expired or is unavailable.');
    const total = row.bytes.length;
    const headers: Record<string, string> = { ...privateHeaders, 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Disposition': 'inline', 'X-Response-Message': 'Your voice reply is ready to play.' };
    const invalidRange = () => {
      const response = errorResponse(new PublicError(416, 'The requested audio range is invalid. Request bytes within this audio file or remove the Range header.'));
      response.headers.set('Content-Range', `bytes */${total}`);
      return response;
    };
    const range = request.headers.get('range');
    if (!range) return new Response(row.bytes as BodyInit, { headers: { ...headers, 'Content-Length': String(total) } });
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return invalidRange();
    const start = Number(match[1]); const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start >= total || start > end) return invalidRange();
    return new Response(row.bytes.slice(start, end + 1) as BodyInit, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) } });
  });
}

export const POST = () => methodNotAllowed(['GET']);
export const PUT = () => methodNotAllowed(['GET']);
export const PATCH = () => methodNotAllowed(['GET']);
export const DELETE = () => methodNotAllowed(['GET']);
export const OPTIONS = () => methodNotAllowed(['GET']);
