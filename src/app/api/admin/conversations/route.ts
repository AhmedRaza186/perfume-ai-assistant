import { methodNotAllowed } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { db } from '@/server/db';
import { guarded, json } from '@/server/http';
import { PublicError } from '@/server/http';
import { parse } from '@/server/validation';
import { z } from 'zod';

export async function GET(request: Request) {
  return guarded(async () => {
    await requireAdmin();
    const id = new URL(request.url).searchParams.get('id');
    if (id !== null) {
      parse(z.string().uuid(), id);
      if (!await db().prepare('SELECT id FROM conversations WHERE id=?').get(id)) throw new PublicError(404, 'This conversation was not found. It may have expired or been deleted.');
      return json((await db().prepare('SELECT query,channel,status,response,created FROM turns WHERE conversation=? ORDER BY seq LIMIT 200').all(id)).map(row => ({ ...row, response: row.response ? JSON.parse(String(row.response)) : null })), 200, 'Conversation messages were loaded successfully.');
    }
    return json(await db().prepare('SELECT id,created FROM conversations ORDER BY created DESC LIMIT 100').all(), 200, 'Saved conversations were loaded successfully.');
  });
}

export const POST = () => methodNotAllowed(['GET']);
export const PUT = () => methodNotAllowed(['GET']);
export const PATCH = () => methodNotAllowed(['GET']);
export const DELETE = () => methodNotAllowed(['GET']);
export const OPTIONS = () => methodNotAllowed(['GET']);
