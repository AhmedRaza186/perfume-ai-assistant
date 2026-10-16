import { methodNotAllowed } from '@/server/http';
import { chatLogout } from '@/server/access';
import { guarded, json, sameOrigin } from '@/server/http';

export async function POST(request: Request) {
  return guarded(async () => { sameOrigin(request); await chatLogout(); return json({ ok: true }, 200, 'You have been signed out. Your session is no longer active.'); });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
