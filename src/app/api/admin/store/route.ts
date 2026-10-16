import { methodNotAllowed } from '@/server/http';
import { requireAdmin } from '@/server/auth';
import { guarded, json, readJson, sameOrigin } from '@/server/http';
import { storeSnapshot, updateStore } from '@/server/admin';

export async function GET() {
  return guarded(async () => { await requireAdmin(); return json(storeSnapshot(), 200, 'Store products, policies and enquiries were loaded successfully.'); });
}
export async function PUT(request: Request) {
  return guarded(async () => { await requireAdmin(); sameOrigin(request); return json(updateStore(await readJson(request, 512_000)), 200, 'Your store changes were saved successfully.'); });
}

export const POST = () => methodNotAllowed(['GET', 'PUT']);
export const PATCH = () => methodNotAllowed(['GET', 'PUT']);
export const DELETE = () => methodNotAllowed(['GET', 'PUT']);
export const OPTIONS = () => methodNotAllowed(['GET', 'PUT']);
