import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const directory = mkdtempSync(path.join(tmpdir(), 'perfume-tests-'));
process.env.SQLITE_PATH = path.join(directory, 'store.sqlite');
process.env.PROVIDER_FREE_TIER_CONFIRMED = 'true';
process.env.GEMINI_API_KEY = 'mock-gemini-key';
process.env.GROQ_API_KEY = 'mock-groq-key';
process.env.URDU_TTS_APPROVED = 'true';
const { db, policies, writeSetting, cleanup } = await import('../src/server/db');
const { respond } = await import('../src/server/assistant');
const { storeSnapshot, updateStore, resetStore } = await import('../src/server/admin');
const { validSession } = await import('../src/server/auth');
const { limit, hash, sameOrigin, boundedBody, json, errorResponse, methodNotAllowed, PublicError } = await import('../src/server/http');
const { parse, querySchema } = await import('../src/server/validation');
const { validateAudio } = await import('../src/server/audio');
const { INITIAL_PRODUCTS } = await import('../src/fixtures/products');
const { INITIAL_POLICIES } = await import('../src/fixtures/policies');
const originalFetch = globalThis.fetch;
let calls: { url: string; body: unknown }[] = [];
let modelAnswer = { text: 'Velvet Oud 50ml costs PKR 2,500. Online payment and COD are available.', productId: 'prod-velvet-oud', handoff: false };
let speechFails = false;
let answerStatus = 200;
let transcriptionStatus = 200;
let transcriptText = 'ویلویٹ عود کی قیمت کیا ہے؟';
beforeEach(() => {
  db().exec('DELETE FROM conversations; DELETE FROM turns; DELETE FROM audio; DELETE FROM recordings; DELETE FROM enquiries; DELETE FROM limits; DELETE FROM sessions; DELETE FROM customer_preferences; DELETE FROM human_messages; DELETE FROM order_drafts; DELETE FROM order_requests; DELETE FROM knowledge;');
  writeSetting('products', INITIAL_PRODUCTS); writeSetting('policies', INITIAL_POLICIES);
  calls = []; speechFails = false; answerStatus = 200;
  transcriptionStatus = 200; transcriptText = 'ویلویٹ عود کی قیمت کیا ہے؟';
  process.env.PROVIDER_FREE_TIER_CONFIRMED = 'true'; process.env.URDU_TTS_APPROVED = 'true';
  modelAnswer = { text: 'Velvet Oud 50ml costs PKR 2,500. Online payment and COD are available.', productId: 'prod-velvet-oud', handoff: false };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body });
    if (url.includes('transcriptions')) return transcriptionStatus === 200
      ? Response.json({ text: transcriptText, segments: [{ no_speech_prob: 0.1 }] })
      : Response.json({ error: 'private provider details' }, { status: transcriptionStatus });
    if (url.includes('interactions')) return speechFails ? Response.json({ error: 'private provider detail' }, { status: 500 })
      : Response.json({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: Buffer.alloc(48000).toString('base64') }] }] });
    return answerStatus === 200 ? Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelAnswer) }] } }] })
      : Response.json({ error: 'private provider detail' }, { status: answerStatus });
  };
});
after(async () => {
  globalThis.fetch = originalFetch; db().close();
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
  assert.ok(path.basename(resolved).startsWith('perfume-tests-'));
  await rm(resolved, { recursive: true, force: true });
});

test('text is grounded in stored facts and returns a server-owned recommendation; replay deduplicates even the first turn', async () => {
  const input = { requestId: randomUUID(), query: 'Velvet Oud price, payment and COD?' };
  const result = await respond(input, 'customer-one');
  assert.equal(result.audioUrl, undefined); assert.equal(result.transcript, undefined);
  assert.equal(result.recommendation?.price, 2500); assert.equal(result.recommendation?.size, '50ml Eau de Parfum');
  const body = calls[0].body as { systemInstruction: { parts: { text: string }[] } };
  assert.match(body.systemInstruction.parts[0].text, /"codAvailable":true/);
  assert.match(body.systemInstruction.parts[0].text, /"price":2500/);
  const replay = await respond(input, 'customer-one');
  assert.deepEqual(replay, result); assert.equal(calls.length, 1);
  await assert.rejects(respond({ ...input, query: 'different' }, 'customer-one'), /already used/);
});
test('follow-up context comes from persisted server history; current policy edits reach subsequent answers', async () => {
  const first = await respond({ requestId: randomUUID(), query: 'Velvet Oud?' }, 'customer-one');
  const edited = { ...policies(), payment: { ...policies().payment, codAvailable: false, onlineMethods: ['Bank Transfer'], advanceRequired: 'Full advance required.' } };
  const snapshot = storeSnapshot();
  updateStore({ section: 'policies', data: edited, revision: snapshot.revision });
  modelAnswer = { text: 'COD is unavailable. Full advance is required.', productId: 'prod-velvet-oud', handoff: false };
  await respond({ requestId: randomUUID(), query: 'Is COD available for it?', conversationId: first.conversationId }, 'customer-one');
  const body = calls[1].body as { systemInstruction: { parts: { text: string }[] }; contents: { role: string; parts: { text: string }[] }[] };
  assert.match(body.contents[1].parts[0].text, /prod-velvet-oud/);
  assert.match(body.systemInstruction.parts[0].text, /"codAvailable":false/);
  assert.match(body.systemInstruction.parts[0].text, /Full advance required/);
  assert.throws(() => updateStore({ section: 'policies', data: edited, revision: snapshot.revision }), /another session/);
  await assert.rejects(respond({ requestId: randomUUID(), query: 'hello', conversationId: first.conversationId }, 'customer-two'), /Conversation expired/);
});
test('unknown details require uncertainty in prompt; invalid IDs and unsupported numeric claims are rejected', async () => {
  modelAnswer = { text: 'I do not have batch expiry information. Would you like human review?', productId: null as unknown as string, handoff: false };
  const result = await respond({ requestId: randomUUID(), query: 'Expiry date?' }, 'one');
  assert.match(result.text, /do not have/);
  const body = calls[0].body as { systemInstruction: { parts: { text: string }[] } };
  assert.match(body.systemInstruction.parts[0].text, /If information is missing/);
  assert.match(body.systemInstruction.parts[0].text, /untrusted/);
  modelAnswer = { text: 'Invented recommendation.', productId: 'prod-fake', handoff: false };
  await assert.rejects(respond({ requestId: randomUUID(), query: 'Anything?' }, 'one'), /reliable answer/);
  modelAnswer = { text: 'Velvet Oud costs PKR 9999.', productId: 'prod-velvet-oud', handoff: false };
  await assert.rejects(respond({ requestId: randomUUID(), query: 'Price?' }, 'one'), /reliable answer/);
});
test('mocked voice pipeline keeps Urdu transcript separate, returns private generated WAV, passes exact answer to TTS', async () => {
  const result = await respond({ requestId: randomUUID(), file: new File(['mock audio'], 'recording.webm', { type: 'audio/webm' }) }, 'owner');
  assert.equal(result.transcript, 'ویلویٹ عود کی قیمت کیا ہے؟'); assert.equal(result.audioStatus, 'ready');
  assert.match(result.audioUrl!, /^\/api\/audio\//); assert.equal(result.audioDuration, 1);
  const speechBody = calls[2].body as { input: { content: { text: string }[] }[] };
  assert.equal(speechBody.input[0].content[0].text, result.text);
  const row = db().prepare('SELECT owner,bytes,expires FROM audio').get() as { owner: string; bytes: Uint8Array; expires: number };
  assert.equal(row.owner, 'owner'); assert.equal(Buffer.from(row.bytes).toString('ascii', 0, 4), 'RIFF');
  assert.ok(row.expires - Date.now() <= 15 * 60_000);
});
test('TTS failure and unapproved Urdu speech preserve the real answer and transcript without canned audio', async () => {
  speechFails = true;
  const result = await respond({ requestId: randomUUID(), file: new File(['mock audio'], 'recording.webm') }, 'owner');
  assert.equal(result.audioStatus, 'unavailable'); assert.ok(result.text); assert.ok(result.transcript); assert.equal(result.audioUrl, undefined);
  assert.equal(db().prepare('SELECT count(*) AS count FROM audio').get()?.count, 0);
  process.env.URDU_TTS_APPROVED = 'false'; calls = [];
  await respond({ requestId: randomUUID(), file: new File(['mock audio'], 'recording.webm') }, 'owner');
  assert.equal(calls.length, 2);
});
test('failed or empty transcription asks for a retry or typed question without invoking the answer or speech provider', async () => {
  transcriptionStatus = 500;
  await assert.rejects(respond({ requestId: randomUUID(), file: new File(['mock audio'], 'recording.webm') }, 'owner'), /retry later or type/);
  assert.equal(calls.length, 1);
  transcriptionStatus = 200; transcriptText = ''; calls = [];
  await assert.rejects(respond({ requestId: randomUUID(), file: new File(['mock audio'], 'recording.webm') }, 'owner'), /record again or type/);
  assert.equal(calls.length, 1);
});
test('handoff persists an enquiry and provider failure does not masquerade as an answer', async () => {
  modelAnswer = { text: 'Your enquiry will be saved for admin review.', productId: 'prod-velvet-oud', handoff: true };
  const result = await respond({ requestId: randomUUID(), query: 'I need a human.' }, 'owner');
  assert.equal(result.isHumanHelpTriggered, true); assert.equal(storeSnapshot().enquiries.length, 1);
  assert.match(storeSnapshot().enquiries[0].notes!, /no notification/);
  answerStatus = 429;
  await assert.rejects(respond({ requestId: randomUUID(), query: 'price?' }, 'owner'), /quota/);
  assert.equal(db().prepare("SELECT count(*) AS count FROM turns WHERE status='failed'").get()?.count, 1);
});

test('provider statuses stay readable after conversation refresh without exposing upstream bodies or retrying', async () => {
  const { conversationMessages } = await import('../src/server/conversations');
  const cases = [[400, 'provider_request_rejected'], [401, 'provider_access_denied'], [403, 'provider_access_denied'],
    [404, 'provider_model_unavailable'], [429, 'provider_quota'], [500, 'provider_unavailable'], [503, 'provider_busy'], [504, 'provider_timeout']] as const;
  for (const [status, code] of cases) {
    db().exec('DELETE FROM limits;');
    answerStatus = status;
    const before = calls.length;
    let failure!: InstanceType<typeof PublicError>;
    await assert.rejects(respond({ requestId: randomUUID(), query: 'price?' }, 'owner'), error => {
      assert.ok(error instanceof PublicError); failure = error;
      assert.equal(error.code, code);
      assert.equal(error.details?.find(d => d.field === 'upstreamStatus')?.message, String(status));
      return true;
    });
    assert.equal(calls.length, before + 1);
    const id = String(db().prepare('SELECT id FROM conversations ORDER BY rowid DESC LIMIT 1').get()?.id);
    assert.equal(conversationMessages(id).at(-1)?.text, failure.message);
    const api = await errorResponse(failure).text();
    assert.doesNotMatch(api, /private provider detail|mock-gemini-key/);
  }
});
test('concurrent turns cannot generate duplicate answers; reset is blocked while generation is active', async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const delegate = globalThis.fetch;
  globalThis.fetch = async (input, init) => { await blocked; return delegate(input, init); };
  const requestId = randomUUID();
  const pending = respond({ requestId, query: 'Velvet Oud?' }, 'owner');
  await assert.rejects(respond({ requestId, query: 'Velvet Oud?' }, 'owner'), /still processing/);
  assert.throws(() => resetStore(), /active conversations/);
  release(); await pending;
  assert.equal(calls.length, 1);
});
test('limits, free-tier gate, expiration and session validation fail closed', async () => {
  limit('test-limit', 1); assert.throws(() => limit('test-limit', 1), /Too many/);
  process.env.PROVIDER_FREE_TIER_CONFIRMED = 'false';
  await assert.rejects(respond({ requestId: randomUUID(), query: 'price?' }, 'owner'), /confirm free-tier/);
  assert.equal(calls.length, 0);
  assert.equal(validSession(undefined, 'admin'), false); assert.equal(validSession('forged', 'admin'), false);
  const token = 'a'.repeat(64);
  db().prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), 'customer', Date.now() + 5000);
  assert.equal(validSession(token, 'admin'), false); assert.equal(validSession(token, 'customer'), true);
  db().prepare('INSERT INTO audio VALUES (?,?,?,?)').run(randomUUID(), 'owner', Buffer.alloc(5), Date.now() - 1);
  cleanup(); assert.equal(db().prepare('SELECT count(*) AS count FROM audio').get()?.count, 0);
});
test('CSRF rejects cross-origin requests and streaming input is bounded independently of Content-Length', async () => {
  process.env.APP_ORIGIN = 'http://localhost:3000';
  assert.throws(() => sameOrigin(new Request('http://localhost:3000/api/chat', { headers: { origin: 'https://evil.example' } })), /origin/);
  await assert.rejects(boundedBody(new Request('http://localhost:3000', { method: 'POST', body: 'oversized' }), 2), /too large/);
});
function wav(seconds: number) {
  const data = Buffer.alloc(Math.round(seconds * 16000 * 2)); const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(data.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40); return Buffer.concat([header, data]);
}
test('real ffprobe checks valid WAV container duration and rejects invalid, mismatched, empty and long recordings', async () => {
  assert.equal((await validateAudio(new File([wav(1)], 'one.wav', { type: 'audio/wav' }))).type, 'audio/wav');
  await assert.rejects(validateAudio(new File([wav(61)], 'long.wav', { type: 'audio/wav' })), /up to 60 seconds/);
  await assert.rejects(validateAudio(new File([wav(1)], 'mismatch.webm', { type: 'audio/webm' })), /Invalid recording/);
  await assert.rejects(validateAudio(new File([Buffer.alloc(400)], 'bad.wav', { type: 'audio/wav' })), /Could not read/);
  await assert.rejects(validateAudio(new File([], 'empty.wav', { type: 'audio/wav' })), /nonempty/);
  await assert.rejects(validateAudio(new File([wav(1)], 'file.txt', { type: 'text/plain' })), /Record a/);
});
test('API messages preserve existing data, identify invalid fields and never expose internal errors or submitted secrets', async () => {
  const success = await json({ text: 'Answer', conversationId: 'conversation' }, 200, 'Your question was answered.').json();
  assert.equal(success.success, true); assert.equal(success.text, 'Answer'); assert.equal(success.message, 'Your question was answered.');
  const list = await json([], 200, 'No conversations saved.').json();
  assert.deepEqual(list.data, []); assert.equal(list.message, 'No conversations saved.');
  let invalid: unknown;
  try { parse(querySchema, { query: '', requestId: 'invalid' }); } catch (error) { invalid = error; }
  const failed = await errorResponse(invalid).json();
  assert.equal(failed.success, false); assert.equal(failed.message, failed.error);
  assert.deepEqual(failed.details.map((detail: { field: string }) => detail.field), ['query', 'requestId']);
  const internal = await errorResponse(new Error('secret-key and SQL internals')).json();
  assert.equal(JSON.stringify(internal).includes('secret-key'), false);
  assert.equal((await errorResponse(new PublicError(401, 'Please sign in.')).json()).code, 'unauthorized');
  const wrongMethod = methodNotAllowed(['POST']);
  assert.equal(wrongMethod.status, 405); assert.equal(wrongMethod.headers.get('Allow'), 'POST');
  assert.match((await wrongMethod.json()).message, /accepts POST/);
});

