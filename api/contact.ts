/**
 * Vercel Function for POST /api/contact. Only wiring: environment variables and real dependencies.
 * The logic (and its tests) live in src/lib/contact-handler.ts.
 *
 * Environment (Vercel project settings, never in git):
 *   CONTACT_WEBHOOK_URL     n8n webhook URL (secret: whoever has it can post to the workflow)
 *   CONTACT_WEBHOOK_SECRET  shared HMAC secret, same value as WEBHOOK_SECRET in n8n
 * Without them the endpoint answers 503 and the form shows the "write an e-mail" fallback.
 */
import { handleContact } from '../src/lib/contact-handler';
import { createRateLimiter } from '../src/lib/rate-limit';

// 5 messages per IP per 10 minutes, per function instance.
const limiter = createRateLimiter(5, 10 * 60_000);

export function POST(request: Request): Promise<Response> {
  return handleContact(
    request,
    {
      webhookUrl: process.env.CONTACT_WEBHOOK_URL,
      secret: process.env.CONTACT_WEBHOOK_SECRET,
      // Preview deployments send test payloads: n8n routes them to the test address only.
      test: process.env.VERCEL_ENV !== 'production',
    },
    {
      fetch,
      limiter,
      now: Date.now,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      log: (message) => console.warn(message),
    },
  );
}
