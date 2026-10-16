import { z } from 'zod';
import { chatAccess, chatLogin, chatLogout } from '@/server/access';
import { guarded, json, methodNotAllowed, publicLimit, readJson, sameOrigin } from '@/server/http';
import { parse } from '@/server/validation';

const accessStatus = async () => { const { granted, username } = await chatAccess(); return { granted, username }; };

export async function GET() {
  return guarded(async () => json(await accessStatus(), 200, 'Access status was checked.'));
}
export async function POST(request: Request) {
  return guarded(async () => {
    sameOrigin(request); await publicLimit(request, 'access', 5);
    const input = parse(z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(256) }).strict(), await readJson(request, 2000));
    await chatLogin(input.username, input.password);
    return json(await accessStatus(), 200, 'You are signed in. You can now use the assistant.');
  });
}
export async function DELETE(request: Request) {
  return guarded(async () => { sameOrigin(request); await chatLogout(); return json({ granted: false, username: null }, 200, 'You have been signed out of the assistant.'); });
}

export const PUT = () => methodNotAllowed(['GET', 'POST', 'DELETE']);
export const PATCH = () => methodNotAllowed(['GET', 'POST', 'DELETE']);
export const OPTIONS = () => methodNotAllowed(['GET', 'POST', 'DELETE']);
