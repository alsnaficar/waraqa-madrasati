import { z } from "zod";

import type { MadrasatiPairingClaimResult } from "@/features/madrasati/pairing/madrasati-pairing.service";
import type { TypedSupabaseClient } from "@/platform/database/supabase/context";
import {
  GLOBAL_RATE_LIMIT_KEY,
  SlidingWindowRateLimiter,
} from "./madrasati-pairing.rate-limiter";

/**
 * HTTP handler for `POST /api/madrasati/pairing/claim` — the Madrasati
 * Extension ↔ Waragh pairing bridge.
 *
 * The endpoint is deliberately NOT a Supabase-session endpoint:
 *   - It never accepts a user_id, cookie, Authorization header, or any other
 *     identity input from the caller.
 *   - The pairing's owner is derived server-side by `MadrasatiPairingService`
 *     via the SHA-256 hash of the token (commit 113e66b).
 *   - It never returns the token, its hash, or the owner's user_id.
 *
 * Fail-closed posture:
 *   - The caller's Origin must exactly match `MADRASATI_EXTENSION_ORIGIN`.
 *     A missing env var, a missing Origin, or any mismatch → 403. Never a
 *     wildcard.
 *   - A rate limiter runs BEFORE PairingService so that the service/database
 *     are never touched by a throttled request.
 *   - Rate-limit keys are per client IP ONLY via the `X-Real-IP` header
 *     (`MADRASATI_TRUSTED_IP_HEADER` must equal `X-Real-IP` exactly to enable
 *     per-IP buckets). `X-Forwarded-For` and any other header are NEVER read:
 *     they are client-forgeable. Without the env var the limiter falls back to
 *     a single global bucket (fail closed), so `X-Forwarded-For` can never be
 *     auto-trusted.
 *   - Supabase or unexpected errors become a generic 500 with a fixed log
 *     line (the token, the client IP, and request/response bodies are never
 *     logged together).
 */

export const MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS = 5;
export const MADRASATI_PAIRING_CLAIM_WINDOW_MS = 60_000;
/** The ONLY accepted source of a client IP for per-IP rate limiting. */
export const MADRASATI_PAIRING_CLAIM_IP_HEADER = "X-Real-IP";

const MadrasatiPairingClaimBodySchema = z
  .object({
    token: z.string().min(32).max(128),
  })
  .strict();

export type MadrasatiPairingJsonEnvelope =
  | { ok: true; pairingId: string; state: "paired"; pairedAt: string }
  | { ok: false; code: "expired" | "revoked" | "not_found"; message: string }
  | { ok: false; code: "invalid_request" }
  | { ok: false; code: "forbidden" }
  | { ok: false; code: "rate_limited" }
  | { ok: false; code: "error" };

export type MadrasatiPairingClaimFn = (
  client: TypedSupabaseClient,
  token: string,
) => Promise<MadrasatiPairingClaimResult>;

export interface MadrasatiPairingClaimHandlerDeps {
  /** Exact allowed Origin (chrome-extension://<id>). Missing → reject all. */
  allowedOrigin?: string | null;
  /**
   * Must equal `X-Real-IP` (exactly) to enable per-IP rate-limit buckets.
   * Any other value — including `X-Forwarded-For` — is ignored: requests then
   * share one global bucket (fail closed). `X-Real-IP` itself must come from a
   * trusted edge (Nginx sets it from `$remote_addr`, overwriting client input);
   * do NOT enable it while direct access to the origin port is open.
   */
  trustedIpHeader?: string | null;
  limiter?: SlidingWindowRateLimiter;
  claimFn?: MadrasatiPairingClaimFn;
  getAdminClient?: () => TypedSupabaseClient;
  log?: (message: string) => void;
  now?: () => number;
}

function resolveClaimFn(deps: MadrasatiPairingClaimHandlerDeps): MadrasatiPairingClaimFn {
  if (deps.claimFn) {
    return deps.claimFn;
  }
  return async (client, token) => {
    const { claimMadrasatiPairing } = await import("./madrasati-pairing.server");
    return claimMadrasatiPairing(client, token);
  };
}

async function resolveAdminClient(deps: MadrasatiPairingClaimHandlerDeps): Promise<TypedSupabaseClient> {
  if (deps.getAdminClient) {
    return deps.getAdminClient();
  }
  return getLazyAdminClient();
}

// Lazily resolved service-role client (never bundled to the browser).
let adminClientPromise: Promise<TypedSupabaseClient> | undefined;

function getLazyAdminClient(): Promise<TypedSupabaseClient> {
  if (adminClientPromise) {
    return adminClientPromise;
  }
  adminClientPromise = import("@/platform/database/supabase/client.server").then(
    (m) => m.supabaseAdmin as unknown as TypedSupabaseClient,
  );
  return adminClientPromise;
}

function jsonResponse(status: number, body: MadrasatiPairingJsonEnvelope, cors: Headers): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      "content-type": "application/json; charset=utf-8",
      ...Object.fromEntries(cors.entries()),
    }),
  });
}

/**
 * CORS headers for the claim endpoint. The Allow-Origin header is emitted
 * ONLY when an allowlist value is present — never a wildcard.
 */
export function buildMadrasatiPairingCorsHeaders(allowedOrigin: string): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  if (allowedOrigin.trim()) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin.trim());
  }
  return headers;
}

/** OPTIONS preflight: 204 with the allowlisted CORS headers. */
export function handleMadrasatiPairingOptions(allowedOrigin?: string | null): Response {
  return new Response(null, {
    status: 204,
    headers: buildMadrasatiPairingCorsHeaders(allowedOrigin ?? ""),
  });
}

/**
 * Resolves the rate-limit key from a request.
 *
 * Per-IP buckets are used ONLY when `trustedIpHeader` equals `X-Real-IP`
 * exactly (case-insensitive). That is the single accepted IP source:
 * `X-Forwarded-For` and any other header are never read, so a client cannot
 * manufacture a fresh key. When the env var is unset (or misconfigured), the
 * request falls back to one shared global bucket — the fail-closed behavior.
 */
function resolveLimiterKey(request: Request, trustedIpHeader?: string | null): string {
  if (
    typeof trustedIpHeader === "string" &&
    trustedIpHeader.trim().toLowerCase() === MADRASATI_PAIRING_CLAIM_IP_HEADER.toLowerCase()
  ) {
    const ip = request.headers.get(MADRASATI_PAIRING_CLAIM_IP_HEADER)?.trim();
    if (ip) {
      return ip;
    }
  }
  return GLOBAL_RATE_LIMIT_KEY;
}

/**
 * Handles a claim POST request. Returns the safe JSON envelope described by
 * `MadrasatiPairingJsonEnvelope` wrapped in the matching HTTP status.
 *
 * Business results from `MadrasatiPairingService.claim()` (paired / expired /
 * revoked / not_found) are returned with HTTP 200 and `ok` toggled — the
 * extension branches on the code without leaking anything extra.
 */
export async function handleMadrasatiPairingClaim(
  request: Request,
  deps: MadrasatiPairingClaimHandlerDeps = {},
): Promise<Response> {
  const allowedOrigin = deps.allowedOrigin?.trim() ?? "";
  const cors = buildMadrasatiPairingCorsHeaders(allowedOrigin);
  const log = deps.log ?? ((message: string) => console.info(`[MadrasatiPairingClaim] ${message}`));

  // 1) Origin allowlist — fail closed. No wildcard, no env → reject all.
  const origin = request.headers.get("origin");
  if (!allowedOrigin || !origin || origin !== allowedOrigin) {
    return jsonResponse(403, { ok: false, code: "forbidden" }, cors);
  }

  // 2) Rate limit BEFORE any service/database work.
  const limiter =
    deps.limiter ??
    new SlidingWindowRateLimiter({
      max: MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS,
      windowMs: MADRASATI_PAIRING_CLAIM_WINDOW_MS,
      now: deps.now,
    });

  const limiterKey = resolveLimiterKey(request, deps.trustedIpHeader);
  if (!limiter.tryHit(limiterKey)) {
    return jsonResponse(429, { ok: false, code: "rate_limited" }, cors);
  }

  // 3) Validate the body with Zod — never echo the received input.
  let token: string;
  try {
    const parsed = MadrasatiPairingClaimBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonResponse(400, { ok: false, code: "invalid_request" }, cors);
    }
    token = parsed.data.token;
  } catch {
    return jsonResponse(400, { ok: false, code: "invalid_request" }, cors);
  }

  // 4) Claim via MadrasatiPairingService (commit 113e66b). Owner derived
  //    server-side; the extension never supplies an identity.
  try {
    const claimFn = resolveClaimFn(deps);
    const adminClient = await resolveAdminClient(deps);
    const result = await claimFn(adminClient, token);

    if (!result.ok) {
      return jsonResponse(200, { ok: false, code: result.code, message: result.message }, cors);
    }

    log(`pairing ${result.pairingId} claimed`);
    return jsonResponse(
      200,
      { ok: true, pairingId: result.pairingId, state: result.state, pairedAt: result.pairedAt },
      cors,
    );
  } catch {
    // Never surface the Supabase error, the token, or the request body.
    log("claim failed with an unexpected error");
    return jsonResponse(500, { ok: false, code: "error" }, cors);
  }
}