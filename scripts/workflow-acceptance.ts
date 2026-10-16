import { loadEnvConfig } from '@next/env';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

loadEnvConfig(process.cwd(), true);
async function main() {
  if (process.env.PROVIDER_FREE_TIER_CONFIRMED !== 'true') throw new Error('Free-tier approval is required.');
  const { products, policies } = await import('../src/server/db');
  const { answerQuestion, transcribe, synthesize } = await import('../src/server/providers');
  const { recommendationMatches } = await import('../src/server/assistant');
  const { validateAudio } = await import('../src/server/audio');
  const { PublicError } = await import('../src/server/http');
  const catalogue = await products(); const rules = await policies();
  const first = catalogue.find(p => p.id === 'prod-velvet-oud') || catalogue[0];
  if (!first) throw new Error('A catalogue product is required for acceptance checks.');
  const price = await answerQuestion(`${first.name} ki price kya hai? Online payment aur COD available hain?`, [], catalogue, rules);
  assert.ok(price.text); console.log('REAL catalogue/payment answer:', price.text);
  const recommendation = await answerQuestion('Office ke liye fresh 50ml perfume chahiye, budget 2300 PKR.', [], catalogue, rules);
  assert.equal(recommendation.intent, 'recommend');
  const verified = (recommendation.recommendationIds || []).map(id => catalogue.find(p => p.id === id)!)
    .filter(p => recommendationMatches(p, recommendation.preferences));
  assert.ok(verified.every(p => p.price <= 2300 && p.inStock === true));
  console.log('REAL preference extraction:', JSON.stringify(recommendation.preferences), 'Verified matches:', verified.length);
  if (catalogue.length >= 2) {
    const comparison = await answerQuestion(`Compare ${catalogue[0].name} and ${catalogue[1].name}.`, [], catalogue, rules);
    assert.equal(comparison.intent, 'compare'); assert.ok((comparison.comparisonIds || []).length >= 2);
    console.log('REAL comparison resolved current product IDs.');
  }
  // This is a previously generated synthetic sample, not a human recording.
  const samplePath = path.resolve('provider-check-output/pakistani-urdu-review.wav');
  try {
    const recording = await validateAudio(new File([await readFile(samplePath)], 'acceptance.wav', { type: 'audio/wav' }));
    const transcript = await transcribe(recording);
    console.log('REAL Groq transcription of synthetic Urdu sample:', transcript);
  } catch (error) {
    console.log('REAL transcription not accepted:', error instanceof PublicError ? error.message : 'The synthetic review recording was unavailable.');
    process.exitCode = 1;
  }
  if (process.env.URDU_TTS_APPROVED === 'true') {
    const speech = await synthesize('جی بھائی، آپ کی آرڈر کی درخواست ٹیم کے جائزے کے لیے محفوظ ہو گئی ہے۔');
    const directory = path.resolve('provider-check-output'); await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'workflow-acceptance.wav'), speech.bytes);
    console.log(`REAL configured voice generated a review WAV (${speech.duration.toFixed(1)} seconds). Accent/transcript fidelity still require listening.`);
  } else console.log('TTS not run: Urdu playback approval is disabled.');
}
main().catch(() => { console.error('Real acceptance check failed. No provider result was fabricated; check configuration/quota or structured provider output.'); process.exitCode = 1; });
