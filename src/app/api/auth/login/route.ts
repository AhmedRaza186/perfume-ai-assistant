import { methodNotAllowed } from '@/server/http';
import { z } from 'zod';
import { login } from '@/server/auth';
import { guarded, json, publicLimit, readJson, sameOrigin } from '@/server/http';
import { parse } from '@/server/validation';


export async function POST(request: Request) {
  return guarded(async () => {
    sameOrigin(request); publicLimit(request, 'login', 5);
    const input = parse(z.object({ username: z.string().min(1).max(100), password: z.string().min(1).max(256) }), await readJson(request, 2000));
    await login(input.username, input.password);
    return json({ ok: true }, 200, 'You are signed in as an administrator.');
  });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
