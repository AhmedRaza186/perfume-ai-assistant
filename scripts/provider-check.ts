import { loadEnvConfig } from '@next/env';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

loadEnvConfig(process.cwd());
async function main() {
  const required = ['GEMINI_API_KEY', 'GROQ_API_KEY'];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length || process.env.PROVIDER_FREE_TIER_CONFIRMED !== 'true') {
    console.log(`Live checks not run. Populate locally: ${missing.join(', ') || 'keys present'}; confirm free-tier projects and quotas before setting PROVIDER_FREE_TIER_CONFIRMED=true.`);
    process.exitCode = 1; return;
  }
  const { answerQuestion, models, synthesize, transcribe } = await import('../src/server/providers');
  const { products, policies } = await import('../src/server/db');
  console.log('Configured models:', models());
  // Read-only model availability checks: model lists cannot establish billing tier or remaining account quota.
  for (const [url, headers] of [
    ['https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { 'x-goog-api-key': process.env.GEMINI_API_KEY! }],
    ['https://api.groq.com/openai/v1/models', { Authorization: `Bearer ${process.env.GROQ_API_KEY!}` }],
  ] as [string, Record<string, string>][]) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Model availability check failed. Check your account configuration locally.');
    const body = await response.json();
    const ids = new Set((body.models || body.data || []).map((model: { name?: string; id?: string }) => (model.name || model.id || '').replace('models/', '')));
    const expected = url.includes('groq') ? [models().transcription] : [models().answer, models().speech];
    for (const model of expected) if (!ids.has(model)) throw new Error(`Configured model is unavailable: ${model}`);
  }
  const output = path.resolve('./provider-check-output'); await mkdir(output, { recursive: true });
  const answer = await answerQuestion('Velvet Oud ki price aur size kya hai? Online payment aur COD available hain?', [], await products(), await policies());
  console.log('Real catalogue answer:', answer.text);
  await writeFile(path.join(output, 'answer.json'), JSON.stringify(answer, null, 2));
  const recording = process.argv[2];
  if (recording) {
    const { validateAudio } = await import('../src/server/audio');
    const extension = path.extname(recording).toLowerCase();
    const type = ({ '.webm': 'audio/webm', '.mp4': 'audio/mp4', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav' } as Record<string, string>)[extension];
    if (!type) throw new Error('Supply a real Urdu recording in WebM, MP4, Ogg or WAV format.');
    const file = await validateAudio(new File([await readFile(recording)], path.basename(recording), { type }));
    const transcript = await transcribe(file);
    console.log('Real recording transcript (review against your recording):', transcript);
    await writeFile(path.join(output, 'transcript.txt'), transcript);
  } else console.log('Transcription NOT checked: pass a path to an actual Urdu recording, e.g. npm run providers:check -- ./recording.webm');
  const sample = 'جی بھائی، اس پرفیوم کی قیمت دو ہزار پانچ سو روپے ہے۔ آن لائن پیمنٹ اور کیش آن ڈیلیوری دونوں available ہیں۔';
  try {
    const speech = await synthesize(sample, true);
    await writeFile(path.join(output, 'urdu-review.wav'), speech.bytes);
    console.log(`Real Urdu TTS sample: ${path.join(output, 'urdu-review.wav')} (${speech.duration.toFixed(1)} seconds). Listen before approving URDU_TTS_APPROVED. Urdu support/quality is unverified.`);
  } catch {
    console.log('Urdu TTS failed. Keep URDU_TTS_APPROVED=false. No substitute provider was selected.'); process.exitCode = 1;
  }
  console.log('Model calls establish availability at this moment, not remaining quota. Review AI Studio active rate limits and Groq account limits; no billing settings were modified.');
}
main().catch(() => { console.error('Provider check failed. Check credentials, free quota and models locally. Provider details and keys are not logged.'); process.exitCode = 1; });
