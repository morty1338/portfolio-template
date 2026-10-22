import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../src/lib/rate-limit';

describe('createRateLimiter', () => {
  it('allows `limit` hits per window and key, then refuses until the window slides', () => {
    let t = 0;
    const limiter = createRateLimiter(2, 1000, () => t);
    expect([limiter.hit('a'), limiter.hit('a'), limiter.hit('a')]).toEqual([true, true, false]);
    expect(limiter.hit('b')).toBe(true); // other keys are independent
    t = 999;
    expect(limiter.hit('a')).toBe(false);
    t = 1000; // the first two hits have left the window
    expect(limiter.hit('a')).toBe(true);
  });
});
