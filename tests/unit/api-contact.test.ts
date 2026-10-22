/**
 * Wiring test for the Vercel Function: real fetch against a local stand-in for n8n on a free port
 * (localhost only, no outside network). Checks the env variable names and that the receiver sees
 * exactly the bytes that were signed.
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '../../api/contact';
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verify } from '../../src/lib/signature';

const SECRET = 'wiring-test-secret';
let server: Server;
const received: { headers: IncomingMessage['headers']; body: Buffer }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.CONTACT_WEBHOOK_URL = `http://127.0.0.1:${port}/webhook/contact`;
  process.env.CONTACT_WEBHOOK_SECRET = SECRET;
  delete process.env.VERCEL_ENV;
});

afterAll(() => {
  server.close();
  delete process.env.CONTACT_WEBHOOK_URL;
  delete process.env.CONTACT_WEBHOOK_SECRET;
});

describe('api/contact.ts', () => {
  it('delivers a signed event to the webhook from the environment', async () => {
    const response = await POST(
      new Request('https://site.example/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Anna', email: 'anna@studio.de', message: 'Grüße aus Köln', locale: 'de' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(received).toHaveLength(1);

    const { headers, body } = received[0]!;
    const ts = headers[TIMESTAMP_HEADER.toLowerCase()] as string;
    const signature = headers[SIGNATURE_HEADER.toLowerCase()] as string;
    // Verified on the raw bytes as they arrived, like the n8n "Raw Body" option.
    expect(verify(SECRET, ts, signature, body, Number(ts))).toEqual({ ok: true });
    // No VERCEL_ENV (local) counts as test, so local runs never message real people.
    expect(JSON.parse(body.toString('utf8'))).toMatchObject({
      event: 'contact',
      test: true,
      inquiry: { message: 'Grüße aus Köln' },
    });
  });
});
