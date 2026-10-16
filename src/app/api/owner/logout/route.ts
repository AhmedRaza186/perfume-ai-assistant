import { ownerLogout, requireOwner } from '@/server/auth';
import { guarded, json, methodNotAllowed, sameOrigin } from '@/server/http';

export async function POST(request: Request) {
  return guarded(async () => { await requireOwner(); sameOrigin(request); await ownerLogout(); return json({ ok: true }, 200, 'You have been signed out of the owner portal.'); });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
