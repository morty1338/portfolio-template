import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_AGE_SECONDS, sign, verify } from '../../src/lib/signature';

const SECRET = 'test-secret';
const BODY = '{"event":"contact","note":"Grüße"}';

describe('sign', () => {
  it('is HMAC-SHA256 over "<timestamp>." + the raw body bytes', () => {
    const expected = createHmac('sha256', SECRET).update(`1700000000.${BODY}`, 'utf8').digest('hex');
    expect(sign(SECRET, '1700000000', BODY)).toBe(`sha256=${expected}`);
    // Bytes and string give the same signature (non-ASCII included).
    expect(sign(SECRET, '1700000000', new TextEncoder().encode(BODY))).toBe(sign(SECRET, '1700000000', BODY));
  });
});

describe('verify', () => {
  const now = 1_700_000_000;
  const ts = String(now);
  const good = sign(SECRET, ts, BODY);

  it('accepts a correct signature', () => {
    expect(verify(SECRET, ts, good, BODY, now)).toEqual({ ok: true });
  });

  it('rejects a wrong secret, a changed body or a tampered signature', () => {
    expect(verify('other-secret', ts, good, BODY, now)).toEqual({ ok: false, reason: 'signature' });
    expect(verify(SECRET, ts, good, BODY.replace('Grüße', 'Grüsse'), now)).toEqual({ ok: false, reason: 'signature' });
    expect(verify(SECRET, ts, good.slice(0, -1), BODY, now)).toEqual({ ok: false, reason: 'signature' });
  });

  it('rejects replays and malformed timestamps', () => {
    expect(verify(SECRET, ts, good, BODY, now + MAX_AGE_SECONDS + 1)).toEqual({ ok: false, reason: 'timestamp' });
    expect(verify(SECRET, ts, good, BODY, now - MAX_AGE_SECONDS - 1)).toEqual({ ok: false, reason: 'timestamp' });
    expect(verify(SECRET, 'abc', good, BODY, now)).toEqual({ ok: false, reason: 'timestamp' });
  });

  it('a signature for one timestamp is not valid for another', () => {
    expect(verify(SECRET, String(now + 1), good, BODY, now)).toEqual({ ok: false, reason: 'signature' });
  });
});
