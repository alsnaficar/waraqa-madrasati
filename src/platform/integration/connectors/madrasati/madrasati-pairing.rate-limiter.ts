/**
 * In-memory sliding-window rate limiter for the Madrasati pairing claim
 * endpoint.
 *
 * Server-only, zero-dependency. Deliberately independent of
 * `MadrasatiPairingService`: a 429 from this limiter must never touch
 * PairingService, the Supabase client, or the database.
 *
 * The key is a plain string. By default the endpoint uses a single global
 * bucket (`__global__`) so that a spoofable `x-forwarded-for` is never
 * trusted unless a trusted proxy header is explicitly configured (ops sets
 * `MADRASATI_TRUSTED_IP_HEADER`). Failing closed is safer than trusting a
 * header every client can forge.
 *
 * State is in-memory and is wiped on process restart — acceptable for a
 * token-gated, idempotent, low-traffic endpoint.
 */

export const GLOBAL_RATE_LIMIT_KEY = "__global__";

export interface SlidingWindowRateLimiterOptions {
  /** Maximum number of hits allowed inside one window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable clock (tests). Returns epoch milliseconds. */
  now?: () => number;
  /** Cap on the number of tracked keys; oldest keys are evicted past this. */
  maxKeys?: number;
}

export class SlidingWindowRateLimiter {
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  /** key -> sorted epoch-ms timestamps of recent hits. */
  private readonly hits = new Map<string, number[]>();

  constructor(options: SlidingWindowRateLimiterOptions) {
    if (!Number.isInteger(options.max) || options.max < 1) {
      throw new RangeError("rate limiter max must be a positive integer");
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
      throw new RangeError("rate limiter window must be a positive number");
    }
    this.max = options.max;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  /** Number of hits for a key inside the current window (after pruning). */
  count(key: string): number {
    return this.prune(key).length;
  }

  /**
   * Records a hit for the key when the key is inside its limit.
   * Returns `true` when the request may proceed, `false` on rate limit.
   */
  tryHit(key: string): boolean {
    this.evictIfNeeded();
    const within = this.prune(key);

    if (within.length >= this.max) {
      return false;
    }

    within.push(this.now());
    this.hits.set(key, within);
    return true;
  }

  private prune(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    const existing = this.hits.get(key);

    if (!existing) {
      return [];
    }

    const kept = existing.filter((timestamp) => timestamp > cutoff);

    if (kept.length === 0) {
      this.hits.delete(key);
      return [];
    }

    this.hits.set(key, kept);
    return kept;
  }

  private evictIfNeeded(): void {
    if (this.hits.size <= this.maxKeys) {
      return;
    }

    // Evict the oldest key first (by its earliest kept timestamp).
    let oldestKey: string | null = null;
    let oldestTimestamp = Number.POSITIVE_INFINITY;

    for (const [key, timestamps] of this.hits) {
      if (timestamps.length === 0) {
        this.hits.delete(key);
        continue;
      }
      const first = timestamps[0];
      if (first < oldestTimestamp) {
        oldestTimestamp = first;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.hits.delete(oldestKey);
    }
  }
}