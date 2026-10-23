/**
 * The contact endpoint's logic, independent of the hosting: Web-standard Request in, Response out.
 * api/contact.ts only wires in environment variables and real dependencies; tests inject fakes.
 *
 * Flow: method/origin/type/size checks → rate limit → validation (src/lib/contact.ts, the same
 * rules as the browser) → honeypot (silent success) → signed POST to the n8n webhook with retries.
 * The webhook URL is a secret: it is never logged or returned.
 */
import { defaultLocale, LOCALES, type Locale } from '../config/locales.js';
import { localizePath } from '../i18n/routing.js';
import { validateContact, type ContactPayload } from './contact.js';
import type { RateLimiter } from './rate-limit.js';
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from './signature.js';

export const MAX_BODY_BYTES = 20_000;
export const ATTEMPT_TIMEOUT_MS = 4_000;
/** Pauses before the 2nd and 3rd attempt. Short: a person is waiting for the answer. */
export const RETRY_DELAYS_MS = [500, 1_500];

export interface ContactConfig {
  webhookUrl?: string;
  secret?: string;
  /** Marks payloads from non-production deployments, so n8n never messages real people for them. */
  test: boolean;
}

export interface ContactDeps {
  fetch: typeof fetch;
  limiter: RateLimiter;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

/** What n8n receives (signed). Version it so the workflow can reject shapes it doesn't know. */
export interface ContactEvent {
  event: 'contact';
  version: 1;
  test: boolean;
  receivedAt: string;
  inquiry: ContactPayload;
}

type Outcome = 'sent' | 'failed';

export async function handleContact(request: Request, config: ContactConfig, deps: ContactDeps): Promise<Response> {
  if (request.method !== 'POST') {
    return json(405, { ok: false, error: 'method-not-allowed' }, { Allow: 'POST' });
  }

  // Browsers send Origin on cross-site POSTs; only our own pages may post here.
  const origin = request.headers.get('origin');
  if (origin && safeHost(origin) !== new URL(request.url).host) {
    return json(403, { ok: false, error: 'forbidden-origin' });
  }

  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  const isForm = type === 'application/x-www-form-urlencoded';
  if (type !== 'application/json' && !isForm) return json(415, { ok: false, error: 'unsupported-media-type' });

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: 'too-large' });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { ok: false, error: 'too-large' });

  if (!deps.limiter.hit(clientKey(request)))
    return json(429, { ok: false, error: 'rate-limited' }, { 'Retry-After': '600' });

  let input: Record<string, unknown>;
  try {
    input = isForm ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text);
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('not an object');
  } catch {
    return json(400, { ok: false, error: 'invalid-json' });
  }

  const locale: Locale = LOCALES.includes(input.locale as Locale) ? (input.locale as Locale) : defaultLocale;
  const answer = (outcome: Outcome, status: number, body: object) =>
    isForm
      ? new Response(null, { status: 303, headers: { Location: localizePath(`/contact/${outcome}/`, locale) } })
      : json(status, body);

  const result = validateContact(input, LOCALES, defaultLocale);
  // A filled honeypot gets the same answer as a real message, so bots learn nothing. Nothing is sent.
  if (!result.ok && result.spam) return answer('sent', 200, { ok: true });
  if (!result.ok) return answer('failed', 400, { ok: false, error: 'invalid', fields: result.errors });

  if (!config.webhookUrl || !config.secret) {
    deps.log('contact: webhook not configured (CONTACT_WEBHOOK_URL / CONTACT_WEBHOOK_SECRET)');
    return answer('failed', 503, { ok: false, error: 'not-configured' });
  }

  const event: ContactEvent = {
    event: 'contact',
    version: 1,
    test: config.test,
    receivedAt: new Date(deps.now()).toISOString(),
    inquiry: result.data,
  };
  const delivered = await deliver(JSON.stringify(event), config.webhookUrl, config.secret, deps);
  return delivered ? answer('sent', 200, { ok: true }) : answer('failed', 502, { ok: false, error: 'delivery-failed' });
}

/** POSTs the exact signed bytes; retries network errors, 5xx and 429; never logs the URL. */
async function deliver(body: string, url: string, secret: string, deps: ContactDeps): Promise<boolean> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1]!);
    const timestamp = String(Math.floor(deps.now() / 1000));
    try {
      const response = await deps.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: sign(secret, timestamp, body),
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (response.ok) return true;
      deps.log(`contact: webhook answered HTTP ${response.status} (attempt ${attempt + 1})`);
      if (response.status < 500 && response.status !== 429) return false; // wrong URL or secret: retrying won't help
    } catch (error) {
      // The error message can contain the URL, so only its type is logged.
      deps.log(`contact: webhook request failed: ${(error as Error).name} (attempt ${attempt + 1})`);
    }
  }
  return false;
}

/** Vercel sets x-forwarded-for; the first entry is the client. */
function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function safeHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

function json(status: number, body: object, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
