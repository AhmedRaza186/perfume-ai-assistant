import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { constants } from 'node:fs';
import { access, chmod, copyFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffprobe from 'ffprobe-static';
import { PublicError } from './http';

const exec = promisify(execFile);
export const AUDIO_LIMIT = 5 * 1024 * 1024;
const formats: Record<string, { extension: string; format: RegExp }> = {
  'audio/webm': { extension: 'webm', format: /webm|matroska/ },
  'audio/mp4': { extension: 'mp4', format: /mov|mp4|m4a/ },
  'audio/ogg': { extension: 'ogg', format: /ogg/ },
  'audio/wav': { extension: 'wav', format: /wav/ },
};
let binary: Promise<string> | undefined;
/** Locates ffprobe. Bundling can drop the executable bit, so a readable copy is made executable under the temp directory. */
function ffprobeBinary() {
  if (process.env.FFPROBE_PATH) return Promise.resolve(process.env.FFPROBE_PATH);
  binary ??= (async () => {
    const name = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    for (const candidate of [ffprobe.path, path.join(process.cwd(), 'node_modules/ffprobe-static/bin', process.platform, process.arch, name)]) {
      try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try a private executable copy. */ }
      try { await access(candidate, constants.R_OK); } catch { continue; }
      const copy = path.join(tmpdir(), `perfume-${name}`);
      await copyFile(candidate, copy); await chmod(copy, 0o755);
      return copy;
    }
    throw Object.assign(new Error('ffprobe binary not found'), { code: 'FFPROBE_MISSING' });
  })().catch(error => { binary = undefined; throw error; });
  return binary;
}
export async function validateAudio(file: File) {
  const type = file.type.split(';')[0].toLowerCase();
  const format = formats[type];
  if (!format) throw new PublicError(415, 'Record a WebM, MP4, Ogg or WAV voice note.');
  if (file.size < 100 || file.size > AUDIO_LIMIT) throw new PublicError(413, 'Voice notes must be nonempty and under 5 MB.');
  const directory = await mkdtemp(path.join(tmpdir(), 'perfume-voice-'));
  const filename = path.join(directory, `recording.${format.extension}`);
  try {
    await writeFile(filename, Buffer.from(await file.arrayBuffer()));
    // Inspect the container AND packets: MediaRecorder WebM frequently lacks a duration header.
    const { stdout } = await exec(await ffprobeBinary(),
      ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_type:packet=pts_time,duration_time', '-of', 'json', filename],
      { timeout: 8000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const info = JSON.parse(stdout);
    const packets: { pts_time?: string; duration_time?: string }[] = info.packets || [];
    const ends = packets.map(p => Number(p.pts_time || 0) + Number(p.duration_time || 0)).filter(Number.isFinite);
    const duration = Math.max(Number(info.format?.duration) || 0, ends.length ? Math.max(...ends) : 0);
    if (!format.format.test(info.format?.format_name || '') || !info.streams?.some((s: { codec_type: string }) => s.codec_type === 'audio') ||
      info.streams?.some((s: { codec_type: string }) => s.codec_type === 'video') || !Number.isFinite(duration) || duration < 0.1 || duration > 60.5)
      throw new PublicError(422, 'Invalid recording. Voice notes must contain audio and last up to 60 seconds.');
    return new File([await file.arrayBuffer()], `recording.${format.extension}`, { type });
  } catch (error) {
    if (error instanceof PublicError) throw error;
    // Only the failure kind is logged (e.g. ENOENT when the ffprobe binary is missing), never the recording.
    // ffprobe's own diagnostic (e.g. "Invalid data found when processing input"), with the temp path removed.
    const reason = String((error as { stderr?: string }).stderr || '').replaceAll(filename, 'input').trim().split('\n').at(-1)?.slice(0, 200);
    const kind = [(error as NodeJS.ErrnoException).code ?? (error as Error).name, reason].filter(Boolean).join(': ');
    console.error('Voice note inspection failed:', kind, `(${type}, ${file.size} bytes)`);
    throw new PublicError(422, 'Could not read this recording. Please record again or type your question.', 'invalid_recording',
      [{ field: 'inspection', message: kind }]);
  } finally {
    const resolved = path.resolve(directory);
    const parent = path.resolve(tmpdir());
    if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('perfume-voice-')) throw new Error('Unexpected temporary path');
    await rm(resolved, { recursive: true, force: true });
  }
}
