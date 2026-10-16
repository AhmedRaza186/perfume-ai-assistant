import { methodNotAllowed } from '@/server/http';
import { guarded, json, publicLimit, sameOrigin, boundedBody, PublicError } from '@/server/http';
import { parse, voiceSchema } from '@/server/validation';
import { customerOwner } from '@/server/auth';
import { respond } from '@/server/assistant';
import { requireAccess } from '@/server/access';
import { AUDIO_LIMIT, validateAudio } from '@/server/audio';


export async function POST(request: Request) {
  return guarded(async () => {
    sameOrigin(request); await publicLimit(request, 'voice', 4);
    await requireAccess();
    const contentType = request.headers.get('content-type');
    if (!contentType?.startsWith('multipart/form-data')) throw new PublicError(415, 'Upload the recording as multipart form data.');
    let form: FormData;
    try {
      const body = await boundedBody(request, AUDIO_LIMIT + 16_000);
      form = await new Response(body as BodyInit, { headers: { 'Content-Type': contentType } }).formData();
    } catch (error) { if (error instanceof PublicError) throw error; throw new PublicError(400, 'Invalid recording upload.'); }
    const input = parse(voiceSchema, {
      conversationId: form.get('conversationId') || undefined, requestId: form.get('requestId'), audioDurationSeconds: form.get('audioDurationSeconds'),
    });
    const file = form.get('audio');
    if (!(file instanceof File)) throw new PublicError(400, 'A recording is required.');
    const validated = await validateAudio(file);
    const response = await respond({ ...input, file: validated }, await customerOwner());
    return json(response, 200, response.audioStatus === 'ready'
      ? 'Your recording was transcribed and answered. The voice reply is ready to play.'
      : response.responseType === 'receipt' ? 'Your recording was transcribed and saved for the person helping you.'
      : !response.audioStatus ? 'Your recording was transcribed. The response is available as text.'
      : 'Your recording was transcribed and answered, but the voice reply is unavailable. Please read the answer text.');
  });
}

export const GET = () => methodNotAllowed(['POST']);
export const PUT = () => methodNotAllowed(['POST']);
export const PATCH = () => methodNotAllowed(['POST']);
export const DELETE = () => methodNotAllowed(['POST']);
export const OPTIONS = () => methodNotAllowed(['POST']);
export const HEAD = () => methodNotAllowed(['POST']);
