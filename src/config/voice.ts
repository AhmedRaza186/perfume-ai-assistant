/** Voice note limits shared by the browser recorder and the server. */
export const MAX_VOICE_SECONDS = 180;
export const MAX_VOICE_LABEL = '3 minutes';
/** Speech-quality Opus keeps a full-length note far below Vercel's 4.5 MB request body limit (~1.1 MB at 180 s). */
export const VOICE_BITS_PER_SECOND = 48_000;
/** Server-side upload ceiling, kept under the hosting body limit so users get a readable error. */
export const VOICE_UPLOAD_BYTES = 4 * 1024 * 1024;
/** Longest transcript accepted; three minutes of speech is roughly 3,000 characters. */
export const MAX_TRANSCRIPT_CHARS = 6000;
