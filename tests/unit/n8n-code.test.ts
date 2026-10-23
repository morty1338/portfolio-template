/**
 * Contract tests for the n8n Code nodes. Each script runs like in n8n: as the body of an async
 * function with stand-ins for $input, $env, $getWorkflowStaticData and this.helpers. URL and
 * URLSearchParams are hidden because n8n's Code sandbox doesn't have them.
 * Requests are signed with the site's own module (src/lib/signature.ts), so sender and receiver must agree.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { codeWithSettings } from '../../integrations/n8n/build-workflow.ts';
import { sign, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '../../src/lib/signature';

const SECRET = 'n8n-test-secret';
const require = createRequire(import.meta.url);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

interface RunOptions {
  json?: Record<string, unknown>;
  raw?: Buffer | null;
  env?: Record<string, string> | 'blocked';
  state?: Record<string, unknown>;
}

async function run(script: string, { json = {}, raw = null, env = {}, state = {} }: RunOptions) {
  const $input = { first: () => ({ json }) };
  const $env =
    env === 'blocked'
      ? new Proxy(
          {},
          {
            get: () => {
              throw new Error('access to env vars denied');
            },
          },
        )
      : env;
  const helpers = {
    getBinaryDataBuffer: async () => {
      if (!raw) throw new Error('no binary data');
      return raw;
    },
  };
  const fn = new AsyncFunction(
    '$input',
    '$env',
    '$getWorkflowStaticData',
    'require',
    'URL',
    'URLSearchParams',
    codeWithSettings(script),
  );
  const out = await fn.call({ helpers }, $input, $env, () => state, require, undefined, undefined);
  return out[0].json;
}

const event = (overrides: Record<string, unknown> = {}) => ({
  event: 'contact',
  version: 1,
  test: false,
  receivedAt: '2026-10-23T12:00:00.000Z',
  inquiry: {
    name: 'Anna',
    email: 'anna@studio.de',
    company: 'Studio',
    message: 'Hallo',
    source: 'demo-film',
    locale: 'de',
  },
  ...overrides,
});

/** A request as the site sends it: exact body bytes plus signature headers. */
function signed(body: string, { secret = SECRET, ts = String(Math.floor(Date.now() / 1000)) } = {}) {
  return {
    json: {
      headers: { [TIMESTAMP_HEADER.toLowerCase()]: ts, [SIGNATURE_HEADER.toLowerCase()]: sign(secret, ts, body) },
    },
    raw: Buffer.from(body, 'utf8'),
    env: { WEBHOOK_SECRET: SECRET },
  };
}

describe('Check signature', () => {
  it('accepts a request signed by the site and returns the event', async () => {
    const body = JSON.stringify(event());
    expect(await run('check_signature', signed(body))).toEqual({ ok: true, status: 200, payload: event() });
  });

  it('rejects a wrong secret, a changed body and a replay with 401', async () => {
    const body = JSON.stringify(event());
    expect(await run('check_signature', signed(body, { secret: 'other' }))).toMatchObject({
      ok: false,
      status: 401,
      reason: 'bad signature',
    });

    const changed = signed(body);
    changed.raw = Buffer.from(body.replace('Hallo', 'Hallo!'), 'utf8');
    expect(await run('check_signature', changed)).toMatchObject({ status: 401, reason: 'bad signature' });

    const old = String(Math.floor(Date.now() / 1000) - 601);
    expect(await run('check_signature', signed(body, { ts: old }))).toMatchObject({
      status: 401,
      reason: 'missing or expired timestamp',
    });
  });

  it('answers 500 when the secret is missing or env access is blocked', async () => {
    const request = signed(JSON.stringify(event()));
    expect(await run('check_signature', { ...request, env: {} })).toMatchObject({ status: 500 });
    expect(await run('check_signature', { ...request, env: 'blocked' })).toMatchObject({ status: 500 });
  });

  it('answers 400 for a missing raw body, bad JSON, an unknown event or a missing field', async () => {
    expect(await run('check_signature', { ...signed('{}'), raw: null })).toMatchObject({ status: 400 });
    expect(await run('check_signature', signed('{"event":'))).toMatchObject({
      status: 400,
      reason: 'body is not JSON',
    });
    expect(await run('check_signature', signed(JSON.stringify(event({ event: 'other' }))))).toMatchObject({
      status: 400,
    });
    const noMessage = event();
    (noMessage.inquiry as Record<string, unknown>).message = '  ';
    expect(await run('check_signature', signed(JSON.stringify(noMessage)))).toMatchObject({
      status: 400,
      reason: 'missing message',
    });
  });

  it('processes the same body only once (the site retries lost answers)', async () => {
    const body = JSON.stringify(event());
    const state = {};
    expect(await run('check_signature', { ...signed(body), state })).toMatchObject({ ok: true });
    // A retry: same bytes, new timestamp and signature.
    expect(await run('check_signature', { ...signed(body), state })).toEqual({
      ok: false,
      status: 200,
      reason: 'already processed',
    });
    // A different message still goes through.
    expect(
      await run('check_signature', {
        ...signed(JSON.stringify(event({ receivedAt: '2026-10-23T12:00:01.000Z' }))),
        state,
      }),
    ).toMatchObject({ ok: true });
  });
});

describe('Build messages', () => {
  const env = {
    CONTACT_OWNER_EMAIL: 'owner@site.example',
    CONTACT_OWNER_NAME: 'Owner Name',
    CONTACT_TEST_EMAIL: 'test@site.example',
  };
  const build = (payload: object, environment: Record<string, string> = env) =>
    run('build_messages', { json: { payload }, env: environment });

  it('builds the lead-list row in the configured column order and time zone', async () => {
    const out = await build(event());
    expect(out.row).toEqual({
      Received: '2026-10-23 14:00',
      Name: 'Anna',
      Company: 'Studio',
      'E-mail': 'anna@studio.de',
      Message: 'Hallo',
      'Came from': 'demo-film',
      Language: 'de',
      Test: '',
    });
  });

  it("sends real events to the owner and the sender, in the sender's language", async () => {
    const out = await build(event());
    expect(out.sendEmails).toBe(true);
    expect(out.ownerMail).toMatchObject({
      to: 'owner@site.example',
      from: 'owner@site.example',
      replyTo: 'anna@studio.de',
    });
    expect(out.ownerMail.text).toContain('Hallo');
    expect(out.senderMail).toMatchObject({ to: 'anna@studio.de', subject: 'Vielen Dank für Ihre Nachricht' });
    expect(out.senderMail.text).toContain('Owner Name');
  });

  it('routes test events only to the test address, marked [TEST]', async () => {
    const out = await build(event({ test: true }));
    expect(out.ownerMail.to).toBe('test@site.example');
    expect(out.senderMail.to).toBe('test@site.example');
    expect(out.ownerMail.subject).toMatch(/^\[TEST\] /);
    expect(out.row.Test).toBe('yes');
  });

  it('sends no e-mail for a test event when no test address is set', async () => {
    const out = await build(event({ test: true }), { CONTACT_OWNER_EMAIL: 'owner@site.example' });
    expect(out).toMatchObject({ sendEmails: false, skipReason: 'test event without CONTACT_TEST_EMAIL' });
  });

  it('never puts form text into the auto-reply (no spam relay through her mailbox)', async () => {
    const payload = event();
    payload.inquiry = { ...payload.inquiry, name: 'Buy cheap pills at spam.example', message: 'click here' };
    const out = await build(payload);
    expect(JSON.stringify(out.senderMail)).not.toMatch(/pills|spam\.example|click here/);
  });

  it('neutralises spreadsheet formulas and header line breaks', async () => {
    const payload = event();
    payload.inquiry = {
      ...payload.inquiry,
      name: '=HYPERLINK("x")\r\nBcc: victim@example.org',
      company: '+1',
      message: '@cmd',
    };
    const out = await build(payload);
    expect(out.row.Name.startsWith("'=")).toBe(true);
    expect(out.row.Company).toBe("'+1");
    expect(out.row.Message).toBe("'@cmd");
    expect(out.ownerMail.subject).not.toMatch(/[\r\n]/);
  });

  it('falls back to English for an unknown language', async () => {
    const payload = event();
    payload.inquiry = { ...payload.inquiry, locale: 'fr' };
    const out = await build(payload);
    expect(out.senderMail.subject).toBe('Thank you for your message');
    expect(out.row.Language).toBe('en');
  });
});
