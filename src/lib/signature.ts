/**
 * Webhook signature shared by the sender (api/contact.ts) and the tests of the n8n receiver.
 *
 *   X-Portfolio-Timestamp: <unix seconds>
 *   X-Portfolio-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>." + rawBody)>
 *
 * The timestamp is part of the signed bytes, so a recorded request can't be replayed later
 * (the receiver rejects timestamps more than MAX_AGE_SECONDS off). The receiver must hash the
 * raw body bytes, never re-serialised JSON.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'X-Portfolio-Signature';
export const TIMESTAMP_HEADER = 'X-Portfolio-Timestamp';
export const MAX_AGE_SECONDS = 600;

export function sign(secret: string, timestamp: string, body: string | Uint8Array): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
  return `sha256=${mac}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'timestamp' | 'signature' };

/** Reference receiver check; the n8n Code node implements the same rules and is tested against this. */
export function verify(
  secret: string,
  timestamp: string,
  signature: string,
  body: string | Uint8Array,
  nowSeconds: number,
): VerifyResult {
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'timestamp' };
  }
  const expected = Buffer.from(sign(secret, timestamp, body));
  const given = Buffer.from(signature);
  // Length check first: timingSafeEqual throws on different lengths.
  return given.length === expected.length && timingSafeEqual(given, expected)
    ? { ok: true }
    : { ok: false, reason: 'signature' };
}
