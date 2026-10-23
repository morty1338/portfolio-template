// "Check signature": accept only calls signed by the site's contact function (api/contact.ts).
//   X-Portfolio-Timestamp: <unix seconds>
//   X-Portfolio-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>." + raw body)>
// Same rules as src/lib/signature.ts; tests/unit/n8n-code.test.ts signs with that module and runs this
// script, so both sides must agree. The Webhook node needs the "Raw Body" option: re-serialised JSON
// would never match the signature.
//
// Secret: WEBHOOK_SECRET in n8n's environment (needs N8N_BLOCK_ENV_ACCESS_IN_NODE=false and
// NODE_FUNCTION_ALLOW_BUILTIN=crypto). Output: { ok, status, reason } or { ok: true, payload }.
const SETTINGS = /* SETTINGS */ {};

const crypto = require('crypto');
const reject = (status, reason) => [{ json: { ok: false, status, reason } }];

let secret = '';
try {
  secret = $env.WEBHOOK_SECRET || '';
} catch (e) {
  secret = ''; // env access blocked: same answer as a missing secret
}
if (!secret) return reject(500, 'WEBHOOK_SECRET is not set in n8n');

const headers = $input.first().json.headers || {};
const ts = String(headers['x-portfolio-timestamp'] || '');
const given = String(headers['x-portfolio-signature'] || '');
if (!/^\d{1,12}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > SETTINGS.maxAgeSeconds) {
  return reject(401, 'missing or expired timestamp');
}

let raw;
try {
  raw = await this.helpers.getBinaryDataBuffer(0, 'data');
} catch (e) {
  return reject(400, 'no raw body (turn on the Webhook option "Raw Body")');
}
const expected =
  'sha256=' +
  crypto
    .createHmac('sha256', secret)
    .update(ts + '.')
    .update(raw)
    .digest('hex');
const a = Buffer.from(given);
const b = Buffer.from(expected);
// Length check first: timingSafeEqual throws on different lengths.
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return reject(401, 'bad signature');

let payload;
try {
  payload = JSON.parse(raw.toString('utf8'));
} catch (e) {
  return reject(400, 'body is not JSON');
}
if (!payload || payload.event !== 'contact' || payload.version !== 1) return reject(400, 'unknown event');
const inquiry = payload.inquiry || {};
for (const field of ['name', 'email', 'message']) {
  if (typeof inquiry[field] !== 'string' || !inquiry[field].trim()) return reject(400, `missing ${field}`);
}

// Idempotency: the site retries when an answer gets lost. The same body (same receivedAt) must not
// create a second row or a second e-mail. Static data persists only for the active (published) workflow.
const key = crypto.createHash('sha256').update(raw).digest('hex');
const state = $getWorkflowStaticData('global');
state.contacts = state.contacts || {};
const now = Date.now();
for (const [k, at] of Object.entries(state.contacts)) {
  if (now - at > SETTINGS.dedupeHours * 3600 * 1000) delete state.contacts[k];
}
if (state.contacts[key]) return [{ json: { ok: false, status: 200, reason: 'already processed' } }];
state.contacts[key] = now;

return [{ json: { ok: true, status: 200, payload } }];
