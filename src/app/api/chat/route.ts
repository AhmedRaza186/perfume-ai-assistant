import { methodNotAllowed } from '@/server/http';
import { guarded, json, publicLimit, readJson, sameOrigin } from '@/server/http';
import { parse, querySchema } from '@/server/validation';
import { customerOwner } from '@/server/auth';
import { respond } from '@/server/assistant';
import { requireAccess } from '@/server/access';


export async function POST(request: Request) {
  return guarded(async () => {
    sameOrigin(request); await publicLimit(request, 'chat', 10);
    await requireAccess();
    const input = parse(querySchema, await readJson(request));
    return json(await respond(input, await customerOwner()), 200, 'Your question was answered successfully.');
  });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
