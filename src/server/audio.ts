import { PublicError } from './http';
import { MAX_VOICE_LABEL, MAX_VOICE_SECONDS, VOICE_UPLOAD_BYTES } from '@/config/voice';

export const AUDIO_LIMIT = VOICE_UPLOAD_BYTES;
const MAX_SECONDS = MAX_VOICE_SECONDS + 0.5;
const tooLong = () => new PublicError(422, `Invalid recording. Voice notes must contain audio and last up to ${MAX_VOICE_LABEL}.`);
type Container = 'webm' | 'mp4' | 'ogg' | 'wav';
const extensions: Record<string, Container> = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };
/** What a container parser found. Duration is undefined when the file does not record it; transcription then enforces the limit. */
type Inspection = { audio: boolean; video: boolean; duration?: number };
class Unreadable extends Error {}

function sniff(bytes: Uint8Array): Container | undefined {
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString('latin1');
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(4, 8) === 'ftyp') return 'mp4';
}

/** EBML/WebM. MediaRecorder writes unknown-size Segment/Cluster elements and no Duration, so masters are entered linearly
 *  and duration comes from cluster + block timecodes. */
function inspectWebm(bytes: Uint8Array): Inspection {
  const masters = new Set([0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0x1f43b675, 0xa0]);
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 0; let docType = ''; let scale = 1_000_000; let declared = 0; let cluster = 0; let latest = 0;
  const result: Inspection = { audio: false, video: false };
  const vint = (keepMarker: boolean) => {
    const first = view[position]; if (first === undefined) return;
    const length = Math.clz32(first) - 23; if (length < 1 || length > 8 || position + length > view.length) throw new Unreadable();
    let value = keepMarker ? first : first & (0xff >> length); let unknown = (first & (0xff >> length)) === (0xff >> length);
    for (let i = 1; i < length; i++) { value = value * 256 + view[position + i]; unknown &&= view[position + i] === 0xff; }
    position += length; return { value, unknown: !keepMarker && unknown };
  };
  const uint = (start: number, size: number) => { let value = 0; for (let i = 0; i < size; i++) value = value * 256 + view[start + i]; return value; };
  while (position < view.length) {
    const id = vint(true); const size = vint(false); if (!id || !size) break;
    if (masters.has(id.value)) continue; // Descend: children follow directly, whatever the declared size.
    if (size.unknown) throw new Unreadable();
    const start = position; const end = start + size.value;
    if (end > view.length) break; // The final element of a stopped recording may be cut short.
    if (id.value === 0x4282) docType = view.toString('latin1', start, end).replace(/\0+$/, '');
    else if (id.value === 0x83) { const type = uint(start, size.value); result.video ||= type === 1; result.audio ||= type === 2; }
    else if (id.value === 0x2ad7b1) scale = uint(start, size.value);
    else if (id.value === 0x4489) declared = size.value === 4 ? view.readFloatBE(start) : size.value === 8 ? view.readDoubleBE(start) : 0;
    else if (id.value === 0xe7) cluster = uint(start, size.value);
    else if (id.value === 0xa3 || id.value === 0xa1) {
      position = start; vint(false); // Track number, then a signed 16-bit timecode relative to the cluster.
      if (position + 2 <= end) latest = Math.max(latest, cluster + view.readInt16BE(position));
    }
    position = end;
  }
  if (docType !== 'webm' && docType !== 'matroska') throw new Unreadable();
  const duration = Math.max(declared, latest) * scale / 1e9;
  return { ...result, duration: duration > 0 ? duration : undefined };
}

/** Ogg pages: the codec header names the stream; the last page's granule position counts decoded samples. */
function inspectOgg(bytes: Uint8Array): Inspection {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Inspection = { audio: false, video: false };
  let position = 0; let granule = 0; let rate = 0; let preSkip = 0;
  while (position + 27 <= view.length && view.toString('latin1', position, position + 4) === 'OggS') {
    const segments = view[position + 26]; const table = position + 27;
    if (table + segments > view.length) break;
    let size = 0; for (let i = 0; i < segments; i++) size += view[table + i];
    const payload = table + segments; const head = view.toString('latin1', payload, Math.min(payload + 8, view.length));
    if (head === 'OpusHead') { result.audio = true; rate = 48_000; preSkip = view.readUInt16LE(payload + 10); }
    else if (head.startsWith('\x01vorbis')) { result.audio = true; rate = view.readUInt32LE(payload + 12); }
    else if (head.startsWith('\x80theora')) result.video = true;
    const value = Number(view.readBigInt64LE(position + 6));
    if (value > 0) granule = value;
    position = payload + size;
  }
  if (!result.audio && !result.video) throw new Unreadable();
  return { ...result, duration: rate && granule ? Math.max(0, granule - preSkip) / rate : undefined };
}

/** ISO BMFF: handler types tell audio from video; mvhd holds the duration when it is not a fragmented recording. */
function inspectMp4(bytes: Uint8Array): Inspection {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const containers = new Set(['moov', 'trak', 'mdia']);
  const result: Inspection = { audio: false, video: false };
  const walk = (start: number, end: number) => {
    let position = start;
    while (position + 8 <= end) {
      let size = view.readUInt32BE(position); const type = view.toString('latin1', position + 4, position + 8); let header = 8;
      if (size === 1) { if (position + 16 > end) break; size = Number(view.readBigUInt64BE(position + 8)); header = 16; }
      else if (size === 0) size = end - position;
      if (size < header) throw new Unreadable();
      const boxEnd = Math.min(position + size, end); const data = position + header;
      if (containers.has(type)) walk(data, boxEnd);
      else if (type === 'hdlr' && data + 12 <= boxEnd) {
        const handler = view.toString('latin1', data + 8, data + 12); result.audio ||= handler === 'soun'; result.video ||= handler === 'vide';
      } else if (type === 'mvhd' && data + 20 <= boxEnd) {
        const v1 = view[data] === 1;
        const timescale = view.readUInt32BE(data + (v1 ? 20 : 12));
        const duration = v1 ? (data + 32 <= boxEnd ? Number(view.readBigUInt64BE(data + 24)) : 0) : view.readUInt32BE(data + 16);
        if (timescale && duration && duration !== 0xffffffff) result.duration = duration / timescale;
      }
      position = position + size;
    }
  };
  walk(0, view.length);
  return result;
}

function inspectWav(bytes: Uint8Array): Inspection {
  const view = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 12; let byteRate = 0; let data = -1;
  while (position + 8 <= view.length) {
    const id = view.toString('latin1', position, position + 4); const size = view.readUInt32LE(position + 4);
    if (id === 'fmt ' && position + 20 <= view.length) byteRate = view.readUInt32LE(position + 16);
    if (id === 'data') { data = Math.min(size, view.length - position - 8); break; }
    position += 8 + size + (size % 2);
  }
  if (!byteRate || data <= 0) throw new Unreadable();
  return { audio: true, video: false, duration: data / byteRate };
}

const inspectors: Record<Container, (bytes: Uint8Array) => Inspection> = { webm: inspectWebm, ogg: inspectOgg, mp4: inspectMp4, wav: inspectWav };
/** Container, streams and recorded duration of raw bytes; throws for unrecognised or malformed data. */
export function inspectAudio(bytes: Uint8Array): Inspection & { container: Container } {
  const container = sniff(bytes);
  if (!container) throw new Unreadable();
  return { container, ...inspectors[container](bytes) };
}

/** Checks a voice note in-process (no external binary): declared type, real container, audio-only, and duration where recorded. */
export async function validateAudio(file: File) {
  const type = file.type.split(';')[0].toLowerCase();
  const expected = extensions[type];
  if (!expected) throw new PublicError(415, 'Record a WebM, MP4, Ogg or WAV voice note.');
  if (file.size < 100 || file.size > AUDIO_LIMIT) throw new PublicError(413, `Voice notes must be nonempty and under ${VOICE_UPLOAD_BYTES / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const actual = sniff(bytes);
  if (!actual) throw new PublicError(422, 'Could not read this recording. Please record again or type your question.');
  const invalid = tooLong();
  if (actual !== expected) throw invalid;
  let info: Inspection;
  try { info = inspectors[actual](bytes); }
  catch (error) {
    if (!(error instanceof Unreadable) && !(error instanceof RangeError)) throw error;
    throw new PublicError(422, 'Could not read this recording. Please record again or type your question.');
  }
  if (!info.audio || info.video || (info.duration !== undefined && (info.duration < 0.1 || info.duration > MAX_SECONDS))) throw invalid;
  return new File([bytes], `recording.${actual}`, { type });
}
/** Applies the duration limit to formats whose files do not record it, using the transcription service's measurement. */
export function checkTranscribedDuration(seconds: unknown) {
  if (typeof seconds === 'number' && seconds > MAX_SECONDS) throw tooLong();
}
