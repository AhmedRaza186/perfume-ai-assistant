import { z } from 'zod';
import { ownerLogin } from '@/server/auth';
import { guarded, json, methodNotAllowed, publicLimit, readJson, sameOrigin } from '@/server/http';
import { parse } from '@/server/validation';

export async function POST(request: Request) {
  return guarded(async () => {
    sameOrigin(request); await publicLimit(request, 'owner-login', 5);
    const input = parse(z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(256) }), await readJson(request, 2000));
    await ownerLogin(input.username, input.password);
    return json({ ok: true }, 200, 'You are signed in to the owner portal.');
  });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
