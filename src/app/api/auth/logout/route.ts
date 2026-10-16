import { methodNotAllowed } from '@/server/http';
import { logout, requireAdmin } from '@/server/auth';
import { guarded, json, sameOrigin } from '@/server/http';

export async function POST(request: Request) {
  return guarded(async () => { await requireAdmin(); sameOrigin(request); await logout(); return json({ ok: true }, 200, 'You have been signed out. Your admin session is no longer active.'); });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
