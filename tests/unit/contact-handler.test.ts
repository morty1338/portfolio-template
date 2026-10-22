/**
 * Contract tests for the contact endpoint. Stand-ins instead of the network: a scripted fetch,
 * a fixed clock, an instant sleep (docs/playbook: "stand-ins, not mocks of the world").
 */
import { describe, expect, it } from 'vitest';
import { handleContact, type ContactConfig, type ContactEvent } from '../../src/lib/contact-handler';
import { createRateLimiter } from '../../src/lib/rate-limit';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from '../../src/lib/signature';

const SECRET = 'test-secret';
const WEBHOOK = 'https://hooks.example/webhook/abc123';
const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const SITE = 'https://site.example';
const valid = {
  name: 'Anna',
  email: 'anna@studio.de',
  company: 'Studio',
  message: 'Hello',
  source: 'demo-film',
  locale: 'de',
};

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** fetch stand-in: answers from a script (status codes or 'network'), records every request. */
function scriptedFetch(script: (number | 'network')[]) {
  const sent: Sent[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: init.body as string });
    const next = script.shift() ?? 200;
    if (next === 'network') throw new TypeError('fetch failed: https://hooks.example/webhook/abc123');
    return new Response('{}', { status: next });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

function setup(script: (number | 'network')[] = [200], config: Partial<ContactConfig> = {}) {
  const { fetch, sent } = scriptedFetch(script);
  const logs: string[] = [];
  const sleeps: number[] = [];
  const deps = {
    fetch,
    limiter: createRateLimiter(5, 600_000, () => NOW),
    now: () => NOW,
    sleep: async (ms: number) => void sleeps.push(ms),
    log: (m: string) => void logs.push(m),
  };
  const run = (request: Request) =>
    handleContact(request, { webhookUrl: WEBHOOK, secret: SECRET, test: false, ...config }, deps);
  return { run, sent, logs, sleeps };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${SITE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const formPost = (fields: Record<string, string>) =>
  new Request(`${SITE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin: SITE },
    body: new URLSearchParams(fields).toString(),
  });

describe('handleContact: delivery', () => {
  it('forwards a valid inquiry as a signed event that the receiver can verify', async () => {
    const { run, sent } = setup();
    const response = await run(post(valid, { origin: SITE }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request!.url).toBe(WEBHOOK);
    const ts = request!.headers[TIMESTAMP_HEADER]!;
    expect(ts).toBe(String(NOW / 1000));
    // The receiver's check passes on exactly the bytes that were sent.
    expect(verify(SECRET, ts, request!.headers[SIGNATURE_HEADER]!, request!.body, NOW / 1000)).toEqual({ ok: true });

    const event = JSON.parse(request!.body) as ContactEvent;
    expect(event).toEqual({
      event: 'contact',
      version: 1,
      test: false,
      receivedAt: '2026-10-22T12:00:00.000Z',
      inquiry: valid,
    });
  });

  it('marks events from preview deployments as test', async () => {
    const { run, sent } = setup([200], { test: true });
    await run(post(valid));
    expect(JSON.parse(sent[0]!.body).test).toBe(true);
  });

  it('retries network errors, 5xx and 429, then succeeds', async () => {
    const { run, sent, sleeps } = setup(['network', 503]);
    expect((await run(post(valid))).status).toBe(200);
    expect(sent).toHaveLength(3);
    expect(sleeps).toEqual([500, 1500]);
  });

  it('gives up after three failed attempts and never logs the webhook URL', async () => {
    const { run, sent, logs } = setup(['network', 500, 429]);
    const response = await run(post(valid));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: 'delivery-failed' });
    expect(sent).toHaveLength(3);
    expect(logs.join('\n')).not.toContain('hooks.example');
    expect(logs.join('\n')).toContain('TypeError');
  });

  it('does not retry a 401/404 from the webhook (wrong secret or URL)', async () => {
    const { run, sent } = setup([401]);
    expect((await run(post(valid))).status).toBe(502);
    expect(sent).toHaveLength(1);
  });

  it('answers 503 without sending when the webhook is not configured', async () => {
    const { run, sent, logs } = setup([200], { webhookUrl: undefined });
    const response = await run(post(valid));
    expect(response.status).toBe(503);
    expect(sent).toHaveLength(0);
    expect(logs[0]).toContain('not configured');
  });
});

describe('handleContact: refusals', () => {
  it('silently "accepts" a filled honeypot without sending anything', async () => {
    const { run, sent } = setup();
    const response = await run(post({ ...valid, website: 'http://spam.example' }));
    expect(response.status).toBe(200);
    expect(sent).toHaveLength(0);
  });

  it('returns field errors for an invalid inquiry', async () => {
    const { run, sent } = setup();
    const response = await run(post({ ...valid, email: 'nope' }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid', fields: { email: 'invalid' } });
    expect(sent).toHaveLength(0);
  });

  it.each([
    ['GET', 405],
    ['PUT', 405],
  ])('rejects %s with %i', async (method, status) => {
    const { run } = setup();
    expect((await run(new Request(`${SITE}/api/contact`, { method }))).status).toBe(status);
  });

  it('rejects posts from other origins, other content types, bad JSON and oversized bodies', async () => {
    const { run, sent } = setup();
    expect((await run(post(valid, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await run(post('hello', { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect((await run(post('{"name":'))).status).toBe(400);
    expect((await run(post('[1,2]'))).status).toBe(400);
    expect((await run(post({ ...valid, message: 'x'.repeat(25_000) }))).status).toBe(413);
    expect(sent).toHaveLength(0);
  });

  it('rate-limits a sender after 5 messages', async () => {
    const { run } = setup([200, 200, 200, 200, 200, 200]);
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await run(post(valid))).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe('handleContact: form posts without JavaScript', () => {
  it('redirects to the localized "sent" page', async () => {
    const { run, sent } = setup();
    const response = await run(formPost({ ...valid, website: '' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/de/contact/sent/');
    expect(sent).toHaveLength(1);
  });

  it('redirects to the "failed" page on invalid input or delivery failure', async () => {
    const invalid = setup();
    const r1 = await invalid.run(formPost({ ...valid, locale: 'en', email: '' }));
    expect(r1.headers.get('location')).toBe('/contact/failed/');
    const down = setup(['network', 'network', 'network']);
    const r2 = await down.run(formPost(valid));
    expect(r2.headers.get('location')).toBe('/de/contact/failed/');
  });
});
