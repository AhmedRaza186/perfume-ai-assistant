import { methodNotAllowed } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { guarded, json, readJson, sameOrigin, PublicError } from '@/server/http';
import { resetStore } from '@/server/admin';

export async function POST(request: Request) {
  return guarded(async () => {
    await requireAdmin(); sameOrigin(request);
    if (process.env.ENABLE_DEMO_RESET !== 'true') throw new PublicError(403, 'Demo reset is disabled. Enable ENABLE_DEMO_RESET locally only when you intend to reset the demo.', 'reset_disabled');
    const body = await readJson(request);
    if (body?.confirmation !== 'RESET DEMO DATA') throw new PublicError(400, 'To confirm the reset, send confirmation with the exact value RESET DEMO DATA.', 'confirmation_required');
    return json(resetStore(), 200, 'Demo products and policies were restored. Saved conversations, audio and enquiries were deleted.');
  });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
