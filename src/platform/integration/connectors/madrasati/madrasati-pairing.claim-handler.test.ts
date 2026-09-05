import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TypedSupabaseClient } from "@/platform/database/supabase/context";
import type { MadrasatiPairingClaimResult } from "@/features/madrasati/pairing/madrasati-pairing.service";
import {
  buildMadrasatiPairingCorsHeaders,
  handleMadrasatiPairingClaim,
  handleMadrasatiPairingOptions,
  MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS,
  MADRASATI_PAIRING_CLAIM_IP_HEADER,
  type MadrasatiPairingClaimHandlerDeps,
} from "./madrasati-pairing.claim-handler";
import { SlidingWindowRateLimiter } from "./madrasati-pairing.rate-limiter";

const ORIGIN = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcd";

function validToken(): string {
  return "a".repeat(43);
}

function claimRequest(body?: unknown, origin: string | null = ORIGIN): Request {
  const headers = new Headers();
  if (origin !== null) {
    headers.set("Origin", origin);
  }
  headers.set("Content-Type", "application/json");
  return new Request("https://waragh.example/api/madrasati/pairing/claim", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? { token: validToken() }),
  });
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await response.text()) as Record<string, unknown>;
}

function okClaimResult(): MadrasatiPairingClaimResult {
  return { ok: true, pairingId: "pairing-1", state: "paired", pairedAt: "2026-09-05T12:00:00.000Z" };
}

type ClaimFn = (client: TypedSupabaseClient, token: string) => Promise<MadrasatiPairingClaimResult>;

interface Harness {
  logged: string[];
  client: TypedSupabaseClient;
  deps: (overrides?: Partial<MadrasatiPairingClaimHandlerDeps>) => MadrasatiPairingClaimHandlerDeps;
}

function createHarness(): Harness {
  const logged: string[] = [];
  const client = {} as unknown as TypedSupabaseClient;
  return {
    logged,
    client,
    deps: (overrides = {}) =>
      ({
        allowedOrigin: ORIGIN,
        getAdminClient: () => client,
        claimFn: async () => okClaimResult(),
        log: (message: string) => logged.push(message),
        ...overrides,
      }) as MadrasatiPairingClaimHandlerDeps,
  };
}

describe("handleMadrasatiPairingClaim", () => {
  it("returns 200 with the safe envelope on a valid claim", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(claimRequest(), h.deps());

    assert.equal(response.status, 200);
    const body = await parseJson(response);
    assert.equal(body.ok, true);
    assert.equal(body.pairingId, "pairing-1");
    assert.equal(body.state, "paired");
  });

  it("rejects a malformed body with a generic 400 (no echo)", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest({ notToken: true }),
      h.deps(),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await parseJson(response), { ok: false, code: "invalid_request" });
  });

  it("rejects a missing token with a generic 400", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(claimRequest({}), h.deps());

    assert.equal(response.status, 400);
  });

  it("rejects a non-string token with a generic 400", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest({ token: 12345 }),
      h.deps(),
    );

    assert.equal(response.status, 400);
  });

  it("rejects an oversized token (> 128) with a generic 400", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest({ token: "a".repeat(129) }),
      h.deps(),
    );

    assert.equal(response.status, 400);
  });

  it("rejects a too-short token (< 32) with a generic 400", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest({ token: "short" }),
      h.deps(),
    );

    assert.equal(response.status, 400);
  });

  it("rejects an extra user_id field (strict schema; no identity from caller)", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest({ token: validToken(), user_id: "user-attacker" }),
      h.deps(),
    );

    assert.equal(response.status, 400, "user_id must never be accepted");
  });

  it("allows the configured origin", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(claimRequest(), h.deps());
    assert.equal(response.status, 200);
  });

  it("rejects a non-matching origin with 403", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest(undefined, "https://evil.example"),
      h.deps(),
    );

    assert.equal(response.status, 403);
  });

  it("rejects a missing Origin header with 403 (fail closed)", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(claimRequest(undefined, null), h.deps());

    assert.equal(response.status, 403);
  });

  it("rejects every origin when the environment origin is empty (fail closed)", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest(),
      h.deps({ allowedOrigin: "" }),
    );

    assert.equal(response.status, 403);
  });

  it("returns 200 with ok:false for known claim outcomes (expired/revoked/not_found)", async () => {
    const h = createHarness();
    for (const code of ["expired", "revoked", "not_found"] as const) {
      const response = await handleMadrasatiPairingClaim(
        claimRequest(),
        h.deps({
          claimFn: async () => ({ ok: false, code, message: `msg-${code}` }),
        }),
      );

      assert.equal(response.status, 200);
      assert.deepEqual(await parseJson(response), { ok: false, code, message: `msg-${code}` });
    }
  });

  it("returns 429 and never calls PairingService once the limiter is exhausted", async () => {
    const h = createHarness();
    let claimCalls = 0;
    const limiter = new SlidingWindowRateLimiter({
      max: MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS,
      windowMs: 60_000,
      now: () => 0,
    });
    const deps = h.deps({
      limiter,
      claimFn: (async () => {
        claimCalls++;
        return okClaimResult();
      }) as ClaimFn,
    });

    for (let i = 0; i < MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS; i++) {
      const response = await handleMadrasatiPairingClaim(claimRequest(), deps);
      assert.equal(response.status, 200);
    }

    const throttled = await handleMadrasatiPairingClaim(claimRequest(), deps);
    assert.equal(throttled.status, 429);
    assert.deepEqual(await parseJson(throttled), { ok: false, code: "rate_limited" });
    assert.equal(claimCalls, MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS, "service must not be called");
  });

  it("turns a Supabase/service error into a generic 500 without leaking details", async () => {
    const h = createHarness();
    const response = await handleMadrasatiPairingClaim(
      claimRequest(),
      h.deps({
        claimFn: (async () => {
          throw new Error("supabase secret detail");
        }) as ClaimFn,
      }),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await parseJson(response), { ok: false, code: "error" });
    assert.match(h.logged.join("\n"), /unexpected error/);
    assert.ok(!h.logged.join("\n").includes(validToken()), "token must not be logged");
  });

  it("never returns the token, its hash, or user_id from any response", async () => {
    const h = createHarness();
    const token = validToken();
    const results: MadrasatiPairingClaimResult[] = [
      { ok: true, pairingId: "p-1", state: "paired", pairedAt: "2026-09-05T12:00:00.000Z" },
      { ok: false, code: "revoked", message: "revoked" },
      { ok: false, code: "expired", message: "expired" },
      { ok: false, code: "not_found", message: "not found" },
    ];

    for (const result of results) {
      const response = await handleMadrasatiPairingClaim(
        claimRequest(),
        h.deps({ claimFn: async () => result }),
      );
      const serialized = JSON.stringify(await parseJson(response));
      assert.ok(!serialized.includes(token), "raw token leaked");
      assert.doesNotMatch(serialized, /[0-9a-f]{64}/, "token hash leaked");
      assert.ok(!serialized.includes("user_id"), "user_id leaked");
    }

    for (const deps of [h.deps({ allowedOrigin: "" }), h.deps({ allowedOrigin: "https://elsewhere" })]) {
      const serialized = JSON.stringify(await parseJson(await handleMadrasatiPairingClaim(claimRequest(), deps)));
      assert.ok(!serialized.includes(token));
    }
  });

  it("uses a global bucket when no trusted IP header is configured", async () => {
    const h = createHarness();
    const limiter = new SlidingWindowRateLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
    const deps = h.deps({ limiter });

    const first = await handleMadrasatiPairingClaim(claimRequest(), deps);
    assert.equal(first.status, 200);

    // A client-supplied X-Forwarded-For must NOT bypass the global bucket.
    const spoofedXff = new Request(claimRequest().url, {
      method: "POST",
      headers: new Headers({
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-Forwarded-For": "1.2.3.4",
        [MADRASATI_PAIRING_CLAIM_IP_HEADER]: "9.9.9.9",
      }),
      body: JSON.stringify({ token: validToken() }),
    });
    const second = await handleMadrasatiPairingClaim(spoofedXff, deps);
    assert.equal(second.status, 429, "untrusted headers must not bypass the global bucket");
  });

  it("does NOT trust X-Forwarded-For even when it is configured as the IP header", async () => {
    const h = createHarness();
    const limiter = new SlidingWindowRateLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
    // Misconfiguration: someone sets the env to X-Forwarded-For. The handler
    // must ignore it (only X-Real-IP is accepted) and stay on the global bucket
    // rather than let a client forge per-IP keys.
    const deps = h.deps({ limiter, trustedIpHeader: "X-Forwarded-For" });

    assert.equal((await handleMadrasatiPairingClaim(claimRequest(), deps)).status, 200);

    const forged = new Request(claimRequest().url, {
      method: "POST",
      headers: new Headers({
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-Forwarded-For": "7.7.7.7",
      }),
      body: JSON.stringify({ token: validToken() }),
    });
    assert.equal((await handleMadrasatiPairingClaim(forged, deps)).status, 429, "X-Forwarded-For must never change the key");
  });

  it("uses X-Real-IP as a per-IP key when X-Real-IP is configured", async () => {
    const h = createHarness();
    const limiter = new SlidingWindowRateLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
    const deps = h.deps({ limiter, trustedIpHeader: MADRASATI_PAIRING_CLAIM_IP_HEADER });

    const a = new Request(claimRequest().url, {
      method: "POST",
      headers: new Headers({
        Origin: ORIGIN,
        "Content-Type": "application/json",
        [MADRASATI_PAIRING_CLAIM_IP_HEADER]: "10.0.0.1",
        "X-Forwarded-For": "1.1.1.1",
      }),
      body: JSON.stringify({ token: validToken() }),
    });
    const b = new Request(claimRequest().url, {
      method: "POST",
      headers: new Headers({
        Origin: ORIGIN,
        "Content-Type": "application/json",
        [MADRASATI_PAIRING_CLAIM_IP_HEADER]: "10.0.0.2",
        "X-Forwarded-For": "1.1.1.1",
      }),
      body: JSON.stringify({ token: validToken() }),
    });

    assert.equal((await handleMadrasatiPairingClaim(a, deps)).status, 200);
    assert.equal((await handleMadrasatiPairingClaim(b, deps)).status, 200, "different X-Real-IP is a separate key");
  });

  it("changes the key when X-Real-IP changes", async () => {
    const h = createHarness();
    const limiter = new SlidingWindowRateLimiter({ max: 1, windowMs: 60_000, now: () => 0 });
    const deps = h.deps({ limiter, trustedIpHeader: MADRASATI_PAIRING_CLAIM_IP_HEADER });

    assert.equal(
      (
        await handleMadrasatiPairingClaim(
          new Request(claimRequest().url, {
            method: "POST",
            headers: new Headers({ Origin: ORIGIN, [MADRASATI_PAIRING_CLAIM_IP_HEADER]: "10.0.0.1" }),
            body: JSON.stringify({ token: validToken() }),
          }),
          deps,
        )
      ).status,
      200,
    );

    assert.equal(
      (
        await handleMadrasatiPairingClaim(
          new Request(claimRequest().url, {
            method: "POST",
            headers: new Headers({ Origin: ORIGIN, [MADRASATI_PAIRING_CLAIM_IP_HEADER]: "10.0.0.2" }),
            body: JSON.stringify({ token: validToken() }),
          }),
          deps,
        )
      ).status,
      200,
      "changing X-Real-IP must yield a fresh bucket",
    );
  });

  it("allows 5 attempts then returns 429 for each IP independently", async () => {
    const h = createHarness();
    const limiter = new SlidingWindowRateLimiter({ max: MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS, windowMs: 60_000, now: () => 0 });
    const deps = h.deps({ limiter, trustedIpHeader: MADRASATI_PAIRING_CLAIM_IP_HEADER });

    const buildIp = (ip: string) =>
      new Request(claimRequest().url, {
        method: "POST",
        headers: new Headers({ Origin: ORIGIN, "Content-Type": "application/json", [MADRASATI_PAIRING_CLAIM_IP_HEADER]: ip }),
        body: JSON.stringify({ token: validToken() }),
      });

    // IP A: 5 allowed, then 429.
    for (let i = 0; i < MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS; i++) {
      assert.equal((await handleMadrasatiPairingClaim(buildIp("10.0.0.1"), deps)).status, 200);
    }
    assert.equal((await handleMadrasatiPairingClaim(buildIp("10.0.0.1"), deps)).status, 429, "IP A throttled after 5");

    // IP B is still allowed its own 5 (independent bucket).
    for (let i = 0; i < MADRASATI_PAIRING_CLAIM_MAX_ATTEMPTS; i++) {
      assert.equal((await handleMadrasatiPairingClaim(buildIp("10.0.0.2"), deps)).status, 200);
    }
    assert.equal((await handleMadrasatiPairingClaim(buildIp("10.0.0.2"), deps)).status, 429, "IP B throttled after 5");
  });
});

describe("OPTIONS / CORS", () => {
  it("returns 204 with allowlisted headers and Vary: Origin, no wildcard", async () => {
    const response = handleMadrasatiPairingOptions(ORIGIN);

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), ORIGIN);
    assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type");
    assert.equal(response.headers.get("vary"), "Origin");
  });

  it("omits allow-origin entirely when the allowlist is empty", async () => {
    const response = handleMadrasatiPairingOptions("");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("vary"), "Origin");
  });

  it("buildCorsHeaders never yields a wildcard", () => {
    assert.notEqual(buildMadrasatiPairingCorsHeaders(ORIGIN).get("access-control-allow-origin"), "*");
  });
});