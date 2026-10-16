import { randomUUID } from 'node:crypto';
import { db, products, policies, transaction } from './db';
import { answerQuestion, transcribe, synthesize, type Answer, type HistoryTurn } from './providers';
import { PublicError, hash } from './http';
import { conversation, setCurrent, startConversation, preferences, requestHandoff, humanReceipt, handoffSaved, liveResponse, modelHistory } from './conversations';
import { confirmInChat, markDraftPresented, orderDraft, patchDraft, paymentMethods, productSummary, orderReceived } from './orders';
import type { AssistantServiceResponse } from '@/types/services';
import type { Product } from '@/types/product';
import { replyLanguage, wording, type ReplyLanguage } from './language';

type Input = { requestId: string; conversationId?: string; query?: string; file?: File; audioDurationSeconds?: number };
type TurnRow = { status: string; fingerprint: string; response: string | null; epoch: number };
const naturalHandoff = (query: string) => /(?:talk|speak|chat|connect|contact).{0,30}(?:person|human|agent|staff)|(?:human|person|agent).{0,20}(?:help|please)|(?:insan|insaan|admin|banda|person|human).{0,30}(?:baat|bat|chahiye|chaiye|help)|(?:کسی|انسان|بندے|ایڈمن).{0,25}(?:بات|مدد)/i.test(query);

export function recommendationMatches(product: Product, pref: Answer['preferences']) {
  return product.inStock === true && (!pref || ((pref.budget == null || product.price <= pref.budget) &&
    (pref.sizeMl == null || (product.bottleSizeMl ?? Number(/\b(\d+(?:\.\d+)?)\s*ml\b/i.exec(product.size)?.[1])) === pref.sizeMl) && (!pref.family || product.families?.includes(pref.family) === true) &&
    (!pref.occasion || product.occasions?.includes(pref.occasion) === true)));
}
function explicitBudget(query: string): number | undefined {
  const normalized = query.replace(/[۰-۹٠-٩]/g, char => String('۰۱۲۳۴۵۶۷۸۹'.includes(char) ? '۰۱۲۳۴۵۶۷۸۹'.indexOf(char) : '٠١٢٣٤٥٦٧٨٩'.indexOf(char))).replace(/(?<=\d),(?=\d{3})/g, '');
  const amount = '(\\d+(?:\\.\\d+)?)\\s*(k\\b|thousand\\b|ہزار(?=\\s|$))?(?![0-9.]|\\s*ml)';
  const match = new RegExp(`${amount}\\s*(?:pkr|rs\\.?|rupees|روپے)?\\s*(?:ka|ki|کا|کی)?\\s*(?:budget|بجٹ)`, 'i').exec(normalized)
    || new RegExp(`(?:budget|under|below|بجٹ|زیادہ سے زیادہ)[^0-9]{0,20}${amount}`, 'i').exec(normalized)
    || new RegExp(`${amount}\\s*(?:pkr|rs\\.?|rupees|روپے)?\\s*(?:ke andar|tak|tk|تک|سے کم)`, 'i').exec(normalized);
  if (!match) return;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) && value <= 1000000 ? value : undefined;
}
function enrich(answer: Answer, query: string, catalogue: Product[], history: HistoryTurn[], language: ReplyLanguage): Partial<AssistantServiceResponse> {
  const recommendationIntent = answer.intent === 'recommend' || (answer.intent !== 'compare' && /recommend|suggest|مشورہ|تجویز|konsa perfume|kaunsa perfume/i.test(query));
  if (answer.intent === 'compare') {
    const ids = [...new Set(answer.comparisonIds || [])];
    if (ids.length < 2) return { text: wording(language, 'Which two perfumes would you like to compare?', 'Aap kin do perfumes ka comparison chahte hain?', 'آپ کن دو پرفیومز کا موازنہ چاہتے ہیں؟') };
    return { comparison: ids.map(id => productSummary(catalogue.find(p => p.id === id)!)), text: wording(language,
      'Here is the current catalogue comparison. Unrecorded details are marked unknown.', 'Current catalogue ka comparison neeche hai. Jo details record nahin hain woh unknown hain.', 'موجودہ کیٹلاگ کے مطابق موازنہ نیچے ہے۔ غیر درج شدہ معلومات نامعلوم ہیں۔') };
  }
  if (recommendationIntent) {
    const budget = explicitBudget(query) ?? [...history].reverse().map(turn => explicitBudget(turn.query)).find(value => value !== undefined);
    const preferences = budget === undefined ? answer.preferences : { ...answer.preferences, budget: Math.min(budget, answer.preferences?.budget ?? budget) };
    const selected = [...new Set(answer.recommendationIds || (answer.productId ? [answer.productId] : []))]
      .map(id => catalogue.find(p => p.id === id)).filter((p): p is Product => !!p && recommendationMatches(p, preferences)).slice(0, 3);
    if (!selected.length) return { text: wording(language, 'I could not verify a match for those preferences in the current catalogue. Would you like to adjust your budget or fragrance preference?',
      'Current catalogue mein in preferences ka verified match nahin mila. Budget ya fragrance preference change karna chahenge?', 'موجودہ کیٹلاگ میں ان ترجیحات کا تصدیق شدہ انتخاب نہیں ملا۔ بجٹ یا خوشبو کی ترجیح تبدیل کرنا چاہیں گے؟') };
    return { recommendations: selected.map(p => ({ ...productSummary(p), reason: [p.notes ? wording(language, `Recorded notes: ${p.notes}`, `Record mein khushboo ke notes: ${p.notes}`, `درج شدہ خوشبو کے نوٹس: ${p.notes}`) : wording(language, 'Notes unknown.', 'Khushboo ke notes record mein nahin hain.', 'خوشبو کے نوٹس درج نہیں ہیں۔'), p.useGuidance || wording(language, 'Use guidance unknown.', 'Istemaal ki rehnumai record mein nahin hai.', 'استعمال کی رہنمائی درج نہیں ہے۔')].join(' ') })),
      text: wording(language, 'These available perfumes match your stated preferences.', 'Yeh available perfumes aap ki batayi preferences se match karte hain.', 'یہ دستیاب پرفیومز آپ کی بتائی ہوئی ترجیحات سے مطابقت رکھتے ہیں۔') };
  }
  const product = catalogue.find(p => p.id === answer.productId);
  return product ? { recommendation: productSummary(product) } : {};
}
export async function respond(input: Input, owner: string): Promise<AssistantServiceResponse> {
  let conversationId = input.conversationId || ''; let epoch = 0;
  const fingerprint = hash(input.file ? Buffer.from(await input.file.arrayBuffer()).toString('base64') : input.query!);
  const previous = await transaction(async () => {
    const existing = await db().prepare('SELECT conversations.id FROM conversations JOIN turns ON turns.conversation=conversations.id WHERE conversations.owner=? AND turns.request=?').get<{ id: string }>(owner, input.requestId);
    if (existing) {
      if (input.conversationId && input.conversationId !== existing.id) throw new PublicError(409, 'This request identifier was already used.');
      conversationId = existing.id;
    }
    if (!existing && await db().prepare('SELECT request FROM turns WHERE request=?').get(input.requestId)) throw new PublicError(409, 'This request identifier was already used.');
    if (input.conversationId || existing) await conversation(conversationId, owner); else conversationId = await startConversation(owner);
    const current = await conversation(conversationId, owner); epoch = current.epoch;
    const row = await db().prepare('SELECT status,fingerprint,response,epoch FROM turns WHERE conversation=? AND request=?').get<TurnRow>(conversationId, input.requestId);
    if (row) {
      if (row.fingerprint !== fingerprint) throw new PublicError(409, 'This request identifier was already used.');
      if (row.status === 'complete') {
        const result = await liveResponse(JSON.parse(row.response!));
        if (result.responseType === 'ai' && (current.state === 'HUMAN_ACTIVE' || row.epoch !== current.epoch))
          return { conversationId, text: current.state === 'HUMAN_ACTIVE' ? humanReceipt : 'Your message was saved. Conversation handling changed; please send your question again.', transcript: result.transcript, responseType: 'receipt' as const, state: current.state };
        return result;
      }
      throw new PublicError(409, row.status === 'pending' ? 'This request is still processing. Please wait.' : 'This request failed. Send a new request to retry.');
    }
    if (await db().prepare("SELECT request FROM turns WHERE conversation=? AND status='pending'").get(conversationId)) throw new PublicError(409, 'Please wait for the previous answer.');
    await setCurrent(owner, conversationId);
    await db().prepare('INSERT INTO turns (conversation,request,fingerprint,query,channel,status,response,created,epoch) VALUES (?,?,?,?,?,?,NULL,?,?)')
      .run(conversationId, input.requestId, fingerprint, input.query || '', input.file ? 'Voice Note' : 'Chat', 'pending', Date.now(), epoch);
    return null;
  });
  if (previous) return previous;
  try {
    if (input.file) {
      const id = randomUUID();
      const bytes = Buffer.from(await input.file.arrayBuffer());
      await db().prepare('INSERT INTO recordings VALUES (?,?,?,?,?,?,?)').run(id, owner, conversationId, bytes, input.file.type.split(';')[0], Date.now() + 15 * 60_000, input.audioDurationSeconds || null);
      await db().prepare('UPDATE turns SET recording=? WHERE conversation=? AND request=?').run(id, conversationId, input.requestId);
    }
    const query = input.file ? await transcribe(input.file) : input.query!;
    await db().prepare('UPDATE turns SET query=? WHERE conversation=? AND request=?').run(query, conversationId, input.requestId);
    const receipt = async (): Promise<AssistantServiceResponse> => {
      const state = (await conversation(conversationId)).state;
      return { text: state === 'HUMAN_ACTIVE' ? humanReceipt : 'Your message was saved. Conversation handling changed; please send your question again.', conversationId, responseType: 'receipt', state, ...(input.file ? { transcript: query } : {}) };
    };
    const stale = async () => { const current = await conversation(conversationId); return current.state === 'HUMAN_ACTIVE' || current.epoch !== epoch; };
    let response: AssistantServiceResponse;
    if (await stale()) response = await receipt();
    else if (naturalHandoff(query)) {
      await requestHandoff(conversationId, query, input.file ? 'Voice Note' : 'Chat');
      response = { text: handoffSaved, conversationId, responseType: 'workflow', isHumanHelpTriggered: true };
    } else {
      const submitted = await confirmInChat(conversationId, query);
      if (submitted) response = { text: `${orderReceived} Reference: ${submitted.reference}`, conversationId, responseType: 'workflow', orderReference: submitted.reference, draft: await orderDraft(conversationId) };
      else {
        const history = (await db().prepare("SELECT query,response FROM turns WHERE conversation=? AND status='complete' ORDER BY seq DESC LIMIT 12").all<{ query: string; response: string }>(conversationId))
          .reverse().map(row => ({ query: row.query, response: JSON.parse(row.response) })) as HistoryTurn[];
        const catalogue = await products(); const rules = await policies(); const language = replyLanguage(query, history.map(turn => turn.query), !!input.file);
        const answer = await answerQuestion(query, history, catalogue, rules, { draft: await orderDraft(conversationId), paymentMethods: await paymentMethods(), replyLanguage: language,
          messages: (await modelHistory(conversationId)).filter(m => !(m.role === 'user' && m.text === JSON.stringify({ sender: 'customer', text: query }))) });
        if (await stale()) response = await receipt();
        else {
          response = { text: answer.text, conversationId, responseType: 'ai', isHumanHelpTriggered: answer.handoff, ...enrich(answer, query, await products(), history, language) };
          if (answer.intent === 'order' || answer.orderPatch) {
            const draft = await patchDraft(conversationId, answer.orderPatch || {});
            response.draft = await markDraftPresented(conversationId); response.responseType = 'workflow';
            response.text = draft.ready ? wording(language, 'Please review and edit the order request summary below, then explicitly confirm submission. Payment has not been collected.',
              'Neeche order request summary review aur edit karein, phir submit karne ki confirmation dein. Payment receive nahin hui.', 'نیچے آرڈر کی درخواست کا خلاصہ دیکھیں، ترمیم کریں اور جمع کرانے کی تصدیق کریں۔ ادائیگی وصول نہیں ہوئی۔')
              : wording(language, `Please provide: ${draft.missing[0] || 'an available product'}. You can edit the other details in the summary below.`,
                `Order request ke liye ${draft.missing[0] || 'available product'} batayein. Baqi details neeche summary mein edit kar sakte hain.`, `آرڈر کی درخواست کے لیے ${draft.missing[0] || 'دستیاب پرفیوم'} بتائیں۔ دیگر معلومات نیچے خلاصے میں درج کر سکتے ہیں۔`);
          }
          if (answer.handoff) await requestHandoff(conversationId, query, input.file ? 'Voice Note' : 'Chat');
        }
      }
    }
    let audio: { bytes: Buffer; duration: number } | undefined;
    if (input.file) {
      response.transcript = query;
      if (response.responseType !== 'receipt' && (await preferences(owner)).reply_format !== 'text' && !await stale()) {
        response.audioStatus = 'unavailable';
        try { audio = await synthesize(response.text); }
        catch (error) { response.audioUnavailableReason = error instanceof PublicError ? error.message : 'Voice generation failed. Please read the answer text.'; }
      }
    }
    await transaction(async () => {
      if (await stale()) { response = await receipt(); audio = undefined; }
      if (audio) {
        const id = randomUUID();
        await db().prepare('INSERT INTO audio VALUES (?,?,?,?)').run(id, owner, audio.bytes, Date.now() + 15 * 60_000);
        response.audioUrl = `/api/audio/${id}`; response.audioStatus = 'ready'; response.audioDuration = audio.duration;
      }
      response.state = (await conversation(conversationId)).state;
      await db().prepare("UPDATE turns SET query=?,response=?,status='complete' WHERE conversation=? AND request=?").run(query, JSON.stringify(response), conversationId, input.requestId);
    });
    return response;
  } catch (error) {
    const failure = error instanceof PublicError ? { text: error.message, code: error.code }
      : { text: 'The server could not complete your message. Please try again later.', code: 'request_failed' };
    await db().prepare("UPDATE turns SET status='failed',response=? WHERE conversation=? AND request=?").run(JSON.stringify(failure), conversationId, input.requestId);
    throw error;
  }
}
