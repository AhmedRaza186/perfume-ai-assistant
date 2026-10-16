import { loadEnvConfig } from '@next/env';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

loadEnvConfig(process.cwd(), true);
async function main() {
  if (!process.env.GEMINI_API_KEY || process.env.PROVIDER_FREE_TIER_CONFIRMED !== 'true')
    throw new Error('Configure Gemini and confirm free-tier access before generating speech.');
  const { models, synthesize } = await import('../src/server/providers');
  const output = path.resolve('provider-check-output');
  await mkdir(output, { recursive: true });
  let designedVoice: string | undefined;
  if (process.argv.includes('--design-pakistani')) {
    if (models().speech !== 'gemini-3.8-flash-lite-tts')
      throw new Error('Voice design uses the configured free-tier Flash-Lite TTS model only.');
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/voices', {
      method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ store: true, voice: {
        model: 'gemini-3.8-flash-tts', type: 'prompted', display_name: 'Pakistani Urdu Perfume Assistant',
        gender: 'male', language_code: 'ur-PK', prompted: { input:
          'A friendly Pakistani male perfume shop assistant in his thirties, with a warm, clear voice and a natural urban Pakistani Urdu accent. He speaks everyday Urdu and code-switches smoothly into English with Pakistani English pronunciation.' },
      } }), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Pakistani voice design was unavailable (HTTP ${response.status}). Existing voice settings were preserved.`);
    const voice = await response.json();
    if (typeof voice.id !== 'string' || !/^voice_[a-zA-Z0-9_-]+$/.test(voice.id))
      throw new Error('Voice design returned no usable voice ID. Existing settings were preserved.');
    designedVoice = voice.id;
    process.env.GEMINI_TTS_VOICE = designedVoice;
  }
  const sample = 'جی بھائی، اس پرفیوم کی قیمت دو ہزار پانچ سو روپے ہے۔ آن لائن پیمنٹ اور کیش آن ڈیلیوری دونوں available ہیں۔';
  const speech = await synthesize(sample, true);
  const filename = path.join(output, 'pakistani-urdu-review.wav');
  await writeFile(filename, speech.bytes);
  if (designedVoice) {
    const envFile = path.resolve('.env.local');
    const original = await readFile(envFile, 'utf8');
    const line = `GEMINI_TTS_VOICE=${designedVoice}`;
    const updated = /^GEMINI_TTS_VOICE=.*$/m.test(original)
      ? original.replace(/^GEMINI_TTS_VOICE=.*$/m, line)
      : `${original.trimEnd()}\n${line}\n`;
    await writeFile(envFile, updated);
    console.log('Configured the designed Pakistani Urdu voice in .env.local.');
  }
  console.log(`Speech sample: ${filename} (${speech.duration.toFixed(1)} seconds). Listen to review the accent.`);
}
main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Speech sample could not be generated.');
  process.exitCode = 1;
});
