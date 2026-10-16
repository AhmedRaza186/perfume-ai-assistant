# Chat and admin workflow extension

No new environment variables, billing changes or provider changes are required. Existing server-side keys, free-tier approval, Urdu speech approval and the configured Pakistani voice remain in use. README and .env.example were not changed for this extension because configuration is unchanged.

## Migrations and existing data

SQLite applies ordered, transactional migrations from `src/server/migrations.ts` once per database, tracked in `schema_migrations`. Version 1 adds conversation state/epochs, preferences, order drafts/requests, human messages and knowledge. Version 2 adds private original voice recordings. Existing product/policy settings, sessions, conversations, turns and enquiries are preserved. Existing conversations start in AI_ACTIVE. The first history restore adopts the latest owned legacy conversation.

Existing business records are not filled with fictional metadata. New demo seeds explicitly mark their source and include fictional preferences. In Products, a matching demo item has an explicit “Fill clearly fictional demo preference metadata” form action; review and save it yourself. For real products, record verified volume, fragrance families, occasions and guidance. Recommendations cannot verify office/gift/family preferences until the relevant metadata exists.

## Customer workflows

- `GET /api/conversation` restores the session's current conversation, saved messages/artifacts, order draft/request and preference. An optional ID is always checked against the customer owner. Local storage is not authoritative. Starting a new conversation changes the server pointer and starts fresh model context.
- `POST /api/conversation` accepts validated actions: new, preference, handoff, edit-order, submit-order. Every mutation requires the configured Origin. New actions are limited to 15/minute per configured public bucket; history polling is 40/minute. Existing chat/voice/provider limits remain unchanged.
- “Match my message” produces text for text input, and voice plus text for voice input. “Text only” transcribes voice and generates the text answer without calling TTS. Preference survives reload and new conversations in the same customer session.
- Recommendations are checked against current prices, known stock and recorded preferences. Comparison cards are generated from structured facts and display unknown fields honestly. Ambiguous comparisons ask which two products were intended.

## Order requests

One editable product/quantity request per conversation is supported. Natural Urdu, Roman Urdu or English messages and voice transcripts extract details into a server draft; the form provides an editable alternative. A submitted request retains an immutable product/price/charge snapshot. Start a new conversation for another request.

Only supported payment preferences are accepted. COD is available only when the structured COD flag is enabled, even if old prose or an online-method label still mentions it. No payment credentials are requested or processed.

The server computes totals from current catalogue prices and the requested quantity. Policies has an explicit delivery calculation editor: exact city rules take priority over a `*` rule, with optional free-above thresholds. Legacy policy prose is not guessed into a rule. Without an applicable rule, delivery charges, total and eligibility remain pending; the customer can submit a request for team review with those unknowns clearly labelled. Known out-of-stock products cannot be submitted.

Confirmation uses a quote token covering draft revisions and the current structured quote. Price/policy/detail changes require re-review. A unique database constraint on draft ID makes repeated confirmations and retries return the same reference. The submit button requires an explicit review checkbox. Chat confirmation recognizes “confirm my order request”, “submit my order request”, “order request confirm hai”, “order request bhej do”, or “آرڈر کی درخواست جمع کریں”; a bare “yes” does not submit. Confirmation is enabled only after a summary was presented.

Admin Orders shows list/detail, New/Reviewing/Contacted/Closed, internal notes and a link to the relevant conversation. Internal notes are omitted from customer payloads. A request reference is not evidence of payment, dispatch, stock reservation or order confirmation.

## Human takeover and privacy

Conversations have AI_ACTIVE, HANDOFF_REQUESTED or HUMAN_ACTIVE state. Handoff actions and detected natural-language requests reuse an open enquiry. No external notification is sent and immediate availability is not promised.

Take over invalidates the generation epoch. State and epoch are checked after transcription, after the text provider, before speech, and within the transaction that stores the final reply/audio. Takeover followed by return to AI still suppresses the old in-flight reply. While HUMAN_ACTIVE, text messages are persisted and voice is transcribed/persisted for the human; the answer provider and TTS do not run. Admin messages are idempotent and labelled “Store team · Human reply”. Return to AI includes the recent customer, AI and human message context. Stored human messages are reference history; structured business data still has priority.

Both interfaces poll at four-second intervals without concurrent polling requests, pause on inactive pages, and abort on unmount. AI requests and mutations take precedence over polling.

Original recordings are private in SQLite for 15 minutes, served from `/api/recordings/[id]` only to their owner or a signed-in administrator. Generated audio retains its existing private 15-minute expiry and is also accessible to authenticated admin reviewers. Playback is manual through the shared single-active player. After expiry, restored history shows transcript-only access and removes expired audio URLs. Transcription failures retain a private original recording for review until expiry. Conversations, related customer messages/drafts/requests/enquiries and transcripts expire after 30 days from conversation creation. Customer sessions/preferences retain their existing 24-hour lifetime; admin sessions retain eight hours. No sensitive customer message contents are logged by the server.

## Knowledge

Admin Knowledge supports add/edit/enable/disable/delete for FAQ, Product guidance and Business information. Each entry has title, content, active state and optimistic revision checks. Limits: 50 entries, 20 active, 2,000 characters per content and 16,000 active title/content characters total. Active content is read for every subsequent answer. Structured catalogue takes precedence for price/size/stock, and structured policies for delivery/payment/returns. Reference content cannot execute instructions. Numeric discrepancies and product pricing references are flagged for review; these warnings are a practical review aid, not a comprehensive conflict detector.

## Verification

`npm test` runs deterministic mocked-provider backend/workflow tests, including migrations, recommendations, comparisons, editable/current-price/idempotent orders, takeover races in all provider stages, human context, owner authorization, audio expiry, preferences and live knowledge updates. `npm run test:http` runs the production HTTP integration suite against a disposable database and ephemeral admin credential, with no real providers. Temporary databases are removed after the tests.

`node --conditions=react-server --import tsx scripts/workflow-acceptance.ts` performs a small live check within existing approval gates and local provider quotas. It does not submit an order or edit business data. On this run: Gemini price/payment answers, Urdu/Roman Urdu preference extraction, real-ID comparison and configured TTS succeeded; Groq transcribed a previously generated synthetic Urdu sample, but rendered it in Hindi/Devanagari script. No human-recorded Urdu acceptance recording was supplied in this request. Urdu script accuracy and speech fidelity still need user listening/recording review. The generated review WAV is in the Git-ignored `provider-check-output/workflow-acceptance.wav`.

No courier tracking, payment processing, external inventory integration, deployment or push was added.
