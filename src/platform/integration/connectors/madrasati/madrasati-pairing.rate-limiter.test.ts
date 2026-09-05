import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GLOBAL_RATE_LIMIT_KEY,
  SlidingWindowRateLimiter,
} from "./madrasati-pairing.rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to max hits inside one window, then rejects", () => {
    const limiter = new SlidingWindowRateLimiter({ max: 5, windowMs: 60_000, now: () => 1_000 });

    for (let i = 0; i < 5; i++) {
      assert.equal(limiter.tryHit("user-1"), true);
    }
    assert.equal(limiter.tryHit("user-1"), false);
    assert.equal(limiter.count("user-1"), 5);
  });

  it("treats different keys as independent buckets", () => {
    const limiter = new SlidingWindowRateLimiter({ max: 1, windowMs: 60_000, now: () => 1_000 });

    assert.equal(limiter.tryHit("a"), true);
    assert.equal(limiter.tryHit("b"), true);
    assert.equal(limiter.count("a"), 1);
    assert.equal(limiter.count("b"), 1);
  });

  it("slides the window: old hits expire and the key recovers", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ max: 2, windowMs: 60_000, now: () => now });

    assert.equal(limiter.tryHit("k"), true); // t=0
    assert.equal(limiter.tryHit("k"), true); // t=0
    assert.equal(limiter.tryHit("k"), false); // t=0

    now = 61_000; // window now starts at 61_000 - 60_000 = 1_000 > 0
    assert.equal(limiter.tryHit("k"), true, "expired hits must slide out");
    assert.equal(limiter.count("k"), 1);
  });

  it("uses a global bucket key constant", () => {
    const limiter = new SlidingWindowRateLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
    assert.equal(limiter.tryHit(GLOBAL_RATE_LIMIT_KEY), true);
    assert.equal(limiter.tryHit("anything-else-in-global-mode"), true, "unrelated key has its own bucket");
  });

  it("deletes keys whose hits all expired", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ max: 5, windowMs: 60_000, now: () => now });

    assert.equal(limiter.tryHit("expiring"), true);
    now = 61_000;
    assert.equal(limiter.count("expiring"), 0);
    assert.equal(limiter.tryHit("expiring"), true);
  });

  it("evicts the oldest key past maxKeys and keeps serving newer keys", () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ max: 3, windowMs: 60_000, now: () => now, maxKeys: 3 });

    assert.equal(limiter.tryHit("old"), true);
    now += 1;
    assert.equal(limiter.tryHit("middle"), true);
    now += 1;
    assert.equal(limiter.tryHit("recent"), true);

    // 4th key pushes size to 4 (no eviction yet; check runs at start of call).
    now += 1;
    assert.equal(limiter.tryHit("newest"), true);

    // 5th key triggers eviction of the oldest ("old", earliest hit timestamp).
    now += 1;
    assert.equal(limiter.tryHit("fifth"), true);
    assert.equal(limiter.count("old"), 0, "oldest key must be evicted");
    assert.equal(limiter.count("middle"), 1);
    assert.equal(limiter.count("recent"), 1);
    assert.equal(limiter.count("newest"), 1);
    assert.equal(limiter.count("fifth"), 1);
  });

  it("rejects invalid constructor options", () => {
    assert.throws(() => new SlidingWindowRateLimiter({ max: 0, windowMs: 1_000 }), RangeError);
    assert.throws(() => new SlidingWindowRateLimiter({ max: 1.5, windowMs: 1_000 }), RangeError);
    assert.throws(() => new SlidingWindowRateLimiter({ max: 1, windowMs: -5 }), RangeError);
  });
});