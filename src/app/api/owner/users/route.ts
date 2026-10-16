import { z } from 'zod';
import { requireOwner } from '@/server/auth';
import { createChatUser, deleteChatUser, listChatUsers, resetChatUserPassword, setChatUserActive } from '@/server/access';
import { guarded, json, methodNotAllowed, readJson, sameOrigin } from '@/server/http';
import { parse } from '@/server/validation';

const id = z.string().uuid();
const password = z.string().min(6).max(256);
export async function GET() {
  return guarded(async () => { await requireOwner(); return json({ users: await listChatUsers() }, 200, 'Chat users were loaded.'); });
}
export async function POST(request: Request) {
  return guarded(async () => {
    await requireOwner(); sameOrigin(request);
    const input = parse(z.object({
      username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores.'),
      password, note: z.string().trim().max(200).default(''), days: z.number().int().min(1).max(3650).optional(),
    }).strict(), await readJson(request, 2000));
    return json({ users: await createChatUser(input.username, input.password, input.note, input.days) }, 200, 'Chat user created.');
  });
}
export async function PATCH(request: Request) {
  return guarded(async () => {
    await requireOwner(); sameOrigin(request);
    const input = parse(z.union([z.object({ id, active: z.boolean() }).strict(), z.object({ id, password }).strict()]), await readJson(request, 2000));
    if ('password' in input) return json({ users: await resetChatUserPassword(input.id, input.password) }, 200, 'Password changed. The user must sign in again.');
    return json({ users: await setChatUserActive(input.id, input.active) }, 200, input.active ? 'Chat user enabled.' : 'Chat user disabled.');
  });
}
export async function DELETE(request: Request) {
  return guarded(async () => {
    await requireOwner(); sameOrigin(request);
    return json({ users: await deleteChatUser(parse(z.object({ id }).strict(), await readJson(request, 1000)).id) }, 200, 'Chat user deleted.');
  });
}

export const PUT = () => methodNotAllowed(['GET', 'POST', 'PATCH', 'DELETE']);
export const OPTIONS = () => methodNotAllowed(['GET', 'POST', 'PATCH', 'DELETE']);
