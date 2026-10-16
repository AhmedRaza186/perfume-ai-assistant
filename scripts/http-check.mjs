// Local production smoke test: isolated SQLite database, ephemeral admin credential, no provider calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import path from 'node:path';

const directory = await mkdtemp(path.join(tmpdir(), 'perfume-http-tests-'));
const port = 3187;
const origin = `http://localhost:${port}`;
const password = randomBytes(24).toString('hex'); const salt = randomBytes(16).toString('hex');
let child;
const env = { ...process.env, APP_ORIGIN: origin, SQLITE_PATH: path.join(directory, 'store.sqlite'),
  ADMIN_USERNAME: 'test-admin', ADMIN_PASSWORD_HASH: `${salt}:${scryptSync(password, salt, 64).toString('hex')}`,
  ENABLE_DEMO_RESET: 'true', PROVIDER_FREE_TIER_CONFIRMED: 'false', GEMINI_API_KEY: '', GROQ_API_KEY: '' };
async function start() {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  // Consume output but do not print server internals or generated credentials.
  child.stdout.resume(); child.stderr.resume();
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error('Production test server failed to start.');
    try { if ((await fetch(`${origin}/login`)).ok) return; } catch { /* Waiting for server readiness. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Production test server startup timed out.');
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended;
}
async function request(route, method = 'GET', body, cookie, customOrigin = origin) {
  return fetch(`${origin}${route}`, { method, redirect: 'manual', headers: {
    ...(method !== 'GET' ? { Origin: customOrigin, 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
try {
  await start();
  for (const route of ['/api/chat', '/api/voice-query', '/api/auth/login', '/api/auth/logout', '/api/admin/store', '/api/admin/reset', '/api/admin/conversations', '/api/admin/workflows', '/api/conversation', '/api/audio/' + randomUUID(), '/api/recordings/' + randomUUID()]) {
    const response = await request(route, 'DELETE');
    assert.equal(response.status, 405, route);
    const result = await response.json();
    assert.equal(result.success, false); assert.match(result.message, /accepts/); assert.equal(result.code, 'method_not_allowed');
    assert.ok(response.headers.get('Allow'));
  }
  for (const [route, method] of [['/api/admin/store', 'GET'], ['/api/admin/store', 'PUT'], ['/api/admin/reset', 'POST'], ['/api/admin/conversations', 'GET'], ['/api/admin/workflows', 'GET'], ['/api/admin/workflows', 'POST'], ['/api/auth/logout', 'POST']]) {
    const response = await request(route, method, method === 'GET' ? undefined : {});
    assert.equal(response.status, 401, `${route} must reject unauthorized access`);
    assert.match((await response.json()).message, /sign in/);
  }
  const adminPage = await request('/admin');
  const html = await adminPage.text();
  assert.ok(adminPage.status === 307 || html.includes('/login'), 'admin must redirect to login');
  assert.equal((await request('/api/audio/' + randomUUID())).status, 401);
  assert.equal((await request('/api/auth/login', 'POST', { username: 'test-admin', password: 'wrong' })).status, 401);
  const signedIn = await request('/api/auth/login', 'POST', { username: 'test-admin', password });
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).message, 'You are signed in as an administrator.');
  const setCookie = signedIn.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=strict/i);
  const cookie = setCookie.split(';')[0];
  let snapshot = await (await request('/api/admin/store', 'GET', undefined, cookie)).json();
  assert.equal(snapshot.success, true); assert.match(snapshot.message, /loaded successfully/);
  const conversations = await (await request('/api/admin/conversations', 'GET', undefined, cookie)).json();
  assert.equal(conversations.success, true); assert.deepEqual(conversations.data, []);
  assert.equal((await request('/api/admin/conversations?id=' + randomUUID(), 'GET', undefined, cookie)).status, 404);
  assert.equal(snapshot.products.find(product => product.id === 'prod-velvet-oud').price, 2500);
  assert.equal((await request('/api/admin/store', 'PUT', { section: 'policies', data: snapshot.policies, revision: snapshot.revision }, cookie, 'https://evil.example')).status, 403);
  const changedPolicy = { ...snapshot.policies, payment: { ...snapshot.policies.payment, codAvailable: false } };
  const edited = await request('/api/admin/store', 'PUT', { section: 'policies', data: changedPolicy, revision: snapshot.revision }, cookie);
  assert.equal(edited.status, 200); snapshot = await edited.json(); assert.equal(snapshot.policies.payment.codAvailable, false);
  await stop(); await start();
  snapshot = await (await request('/api/admin/store', 'GET', undefined, cookie)).json();
  assert.equal(snapshot.policies.payment.codAvailable, false, 'policy and session persist across server restart');
  assert.equal((await request('/api/admin/reset', 'POST', {}, cookie)).status, 400);
  assert.equal((await request('/api/admin/reset', 'POST', { confirmation: 'RESET DEMO DATA' }, cookie)).status, 200);
  const unavailable = await request('/api/chat', 'POST', { query: 'Velvet Oud price?', requestId: randomUUID() });
  assert.equal(unavailable.status, 503, 'missing providers must fail honestly');
  assert.match((await unavailable.json()).message, /confirm free-tier/);
  // Fixture audio tests transport only: a binary success response must not become a JSON envelope.
  const customerCookie = unavailable.headers.get('set-cookie').split(';')[0];
  const owner = createHash('sha256').update(customerCookie.split('=')[1]).digest('hex');
  const audioId = randomUUID(); const fixtureAudio = Buffer.alloc(144); fixtureAudio.write('RIFF');
  const connection = new DatabaseSync(env.SQLITE_PATH);
  try { connection.prepare('INSERT INTO audio VALUES (?,?,?,?)').run(audioId, owner, fixtureAudio, Date.now() + 60_000); }
  finally { connection.close(); }
  const audio = await request('/api/audio/' + audioId, 'GET', undefined, customerCookie);
  assert.equal(audio.status, 200); assert.equal(audio.headers.get('content-type'), 'audio/wav');
  assert.match(audio.headers.get('x-response-message'), /ready to play/);
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), fixtureAudio);
  const badRange = await fetch(`${origin}/api/audio/${audioId}`, { headers: { Cookie: customerCookie, Range: 'bytes=1000-' } });
  assert.equal(badRange.status, 416); assert.match((await badRange.json()).message, /audio range is invalid/);
  assert.equal(badRange.headers.get('content-range'), 'bytes */144');
  const invalid = await request('/api/chat', 'POST', { query: '', requestId: randomUUID() });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.success, false); assert.equal(invalidBody.details[0].field, 'query');
  assert.equal((await request('/api/chat', 'POST', { query: 'hello', requestId: randomUUID() }, undefined, 'https://evil.example')).status, 403);
  assert.equal((await request('/api/voice-query', 'POST', {})).status, 415);
  // Full workflow transport checks use the real production server, isolated data and no providers.
  let current = await (await request('/api/conversation', 'GET', undefined, customerCookie)).json();
  assert.ok(current.messages.some(message => message.sender === 'customer'));
  current = await (await request('/api/conversation', 'POST', { action: 'new' }, customerCookie)).json();
  const conversationId = current.conversationId;
  assert.deepEqual(current.messages, []);
  assert.equal((await request('/api/conversation', 'POST', { action: 'preference', replyFormat: 'text' }, customerCookie, 'https://evil.example')).status, 403);
  current = await (await request('/api/conversation', 'POST', { action: 'preference', replyFormat: 'text' }, customerCookie)).json();
  assert.equal(current.replyFormat, 'text');
  const details = { productId: 'prod-velvet-oud', quantity: 2, customerName: 'Test Customer', phone: '03001234567', address: 'Test address 123', city: 'Karachi', paymentMethod: 'Cash on Delivery (COD)' };
  current = await (await request('/api/conversation', 'POST', { action: 'edit-order', conversationId, revision: 0, details }, customerCookie)).json();
  assert.equal(current.draft.subtotal, 5000); assert.equal(current.draft.deliveryCharge, null);
  assert.equal((await request('/api/conversation', 'POST', { action: 'edit-order', conversationId, revision: current.draft.revision, details: { paymentMethod: 'Bitcoin' } }, customerCookie)).status, 400);
  assert.equal((await request('/api/conversation', 'POST', { action: 'submit-order', conversationId, quoteToken: current.draft.quoteToken, confirmed: false }, customerCookie)).status, 400);
  const submitBody = { action: 'submit-order', conversationId, quoteToken: current.draft.quoteToken, confirmed: true };
  const submitted = await (await request('/api/conversation', 'POST', submitBody, customerCookie)).json();
  const duplicate = await (await request('/api/conversation', 'POST', submitBody, customerCookie)).json();
  assert.equal(submitted.orderReference, duplicate.orderReference); assert.equal(duplicate.orderRequests.length, 1);
  const order = duplicate.orderRequests[0];
  assert.equal((await request('/api/admin/workflows', 'POST', { action: 'order', id: order.id, revision: order.revision, status: 'Reviewing', notes: 'private-review-note' }, cookie)).status, 200);
  assert.ok(!JSON.stringify(await (await request('/api/conversation', 'GET', undefined, customerCookie)).json()).includes('private-review-note'));
  const otherSession = await request('/api/conversation'); const otherCookie = otherSession.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/conversation?id=' + conversationId, 'GET', undefined, otherCookie)).status, 404);
  assert.equal((await request('/api/conversation', 'POST', { action: 'edit-order', conversationId, revision: 1, details: { quantity: 3 } }, otherCookie)).status, 404);
  await request('/api/conversation', 'POST', { action: 'handoff', conversationId }, customerCookie);
  await request('/api/conversation', 'POST', { action: 'handoff', conversationId }, customerCookie);
  const enquiries = await (await request('/api/admin/store', 'GET', undefined, cookie)).json();
  assert.equal(enquiries.enquiries.length, 1);
  assert.equal((await request('/api/admin/workflows', 'POST', { action: 'state', conversationId, state: 'HUMAN_ACTIVE' }, cookie)).status, 200);
  const humanInput = await request('/api/chat', 'POST', { query: 'Please help with my request', conversationId, requestId: randomUUID() }, customerCookie);
  assert.equal(humanInput.status, 200); assert.equal((await humanInput.json()).responseType, 'receipt');
  const humanMessage = { action: 'message', conversationId, requestId: randomUUID(), text: 'Hello from the store team.' };
  await request('/api/admin/workflows', 'POST', humanMessage, cookie); await request('/api/admin/workflows', 'POST', humanMessage, cookie);
  current = await (await request('/api/conversation', 'GET', undefined, customerCookie)).json();
  assert.equal(current.state, 'HUMAN_ACTIVE'); assert.equal(current.messages.filter(message => message.sender === 'human').length, 1);
  const recordingId = randomUUID();
  const recordingFixture = new DatabaseSync(env.SQLITE_PATH);
  try { recordingFixture.prepare('INSERT INTO recordings VALUES (?,?,?,?,?,?,?)').run(recordingId, owner, conversationId, fixtureAudio, 'audio/wav', Date.now() + 60000, 1); }
  finally { recordingFixture.close(); }
  assert.equal((await request('/api/recordings/' + recordingId, 'GET', undefined, customerCookie)).status, 200);
  assert.equal((await request('/api/recordings/' + recordingId, 'GET', undefined, cookie)).status, 200);
  assert.equal((await request('/api/recordings/' + recordingId, 'GET', undefined, otherCookie)).status, 404);
  assert.equal((await request('/api/admin/workflows', 'POST', { action: 'state', conversationId, state: 'AI_ACTIVE' }, cookie)).status, 200);
  const entry = { id: randomUUID(), title: 'FAQ', content: 'Ask the team about gift wrapping.', active: true, kind: 'FAQ', revision: 0 };
  const createdKnowledge = await request('/api/admin/workflows', 'POST', { action: 'knowledge', entry }, cookie);
  assert.equal(createdKnowledge.status, 200); assert.equal((await createdKnowledge.json()).knowledge.length, 1);
  assert.equal((await request('/api/admin/workflows', 'POST', { action: 'knowledge', entry: { ...entry, revision: 1, active: false } }, cookie)).status, 200);
  assert.equal((await request('/api/admin/workflows', 'POST', { action: 'delete-knowledge', id: entry.id, revision: 2 }, cookie)).status, 200);
  assert.equal((await request('/api/auth/logout', 'POST', {}, cookie)).status, 200);
  assert.equal((await request('/api/admin/store', 'GET', undefined, cookie)).status, 401, 'logout must revoke server session');
  console.log('Production HTTP checks passed: admin/customer authorization, private audio/recordings, sign-in, CSRF, persistence, history, editable order drafts, unsupported payment rejection, explicit/idempotent submission, internal-note privacy, handoff deduplication, takeover, human-message delivery, return to AI, preferences, knowledge CRUD, reset, readable errors and logout. No real providers were called.');
} finally {
  await stop();
  const resolved = path.resolve(directory);
  assert.equal(path.dirname(resolved), path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('perfume-http-tests-'));
  await rm(resolved, { recursive: true, force: true });
}
