import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  SupabaseUserContext,
  TypedSupabaseClient,
} from "@/platform/database/supabase/context";
import { hashMadrasatiPairingToken, MadrasatiPairingService } from "./madrasati-pairing.service";
import {
  MADRASATI_PAIRING_TTL_SECONDS_DEFAULT,
  MADRASATI_PAIRING_TTL_SECONDS_MIN,
  validateMadrasatiPairingTtl,
} from "./pairing-contract";

interface MockPairingRow {
  id: string;
  user_id: string;
  token_hash: string;
  status: string;
  created_at: string;
  expires_at: string;
  paired_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

function cloneRow(row: MockPairingRow): MockPairingRow {
  return { ...row };
}

type UpdatePatch = Partial<Omit<MockPairingRow, "id">> & { id?: string };

class MockQueryBuilder {
  private readonly eqFilters: Array<[string, unknown]> = [];
  private readonly inFilters: Array<[string, unknown[]]> = [];
  private orderSpec: { column: string; ascending: boolean } | null = null;
  private limitValue: number | null = null;
  private insertValue: Omit<MockPairingRow, "id"> | null = null;
  private updateValue: UpdatePatch | null = null;

  constructor(
    private readonly store: MockPairingRow[],
    private readonly calls: unknown[],
    private readonly allocId: () => string,
  ) {}

  select(columns: string): this {
    this.calls.push({ op: "select", table: "madrasati_pairings", columns });
    return this;
  }

  eq(column: string, value: unknown): this {
    this.calls.push({
      op: "eq",
      table: "madrasati_pairings",
      column,
      hasValue: value !== undefined,
    });
    this.eqFilters.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.calls.push({ op: "in", table: "madrasati_pairings", column, hasValues: true });
    this.inFilters.push([column, values]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderSpec = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  insert(values: Record<string, unknown>): this {
    this.calls.push({ op: "insert", table: "madrasati_pairings" });
    this.insertValue = values as unknown as Omit<MockPairingRow, "id">;
    return this;
  }

  update(values: UpdatePatch): this {
    this.calls.push({ op: "update", table: "madrasati_pairings" });
    this.updateValue = values;
    return this;
  }

  async maybeSingle(): Promise<{ data: MockPairingRow | null; error: null }> {
    if (this.insertValue) {
      const raw = this.insertValue as Partial<MockPairingRow>;
      const row: MockPairingRow = {
        id: this.allocId(),
        user_id: raw.user_id as string,
        token_hash: raw.token_hash as string,
        status: raw.status ?? "pending",
        created_at: raw.created_at ?? "2026-09-05T00:00:00.000Z",
        expires_at: raw.expires_at as string,
        paired_at: raw.paired_at ?? null,
        revoked_at: raw.revoked_at ?? null,
        last_used_at: raw.last_used_at ?? null,
      };
      this.store.push(row);
      return { data: cloneRow(row), error: null };
    }

    const matched = this.match();
    const first = matched[0] ?? null;
    return { data: first ? cloneRow(first) : null, error: null };
  }

  private match(): MockPairingRow[] {
    let rows = this.store;

    for (const [column, value] of this.eqFilters) {
      rows = rows.filter((row) => row[column as keyof MockPairingRow] === value);
    }
    for (const [column, values] of this.inFilters) {
      rows = rows.filter((row) =>
        (values as unknown[]).includes(row[column as keyof MockPairingRow]),
      );
    }

    if (this.orderSpec) {
      const { column, ascending } = this.orderSpec;
      rows = [...rows].sort((a, b) => {
        const av = a[column as keyof MockPairingRow] as string;
        const bv = b[column as keyof MockPairingRow] as string;
        const cmp = av.localeCompare(bv);
        return ascending ? cmp : -cmp;
      });
    }

    if (this.limitValue !== null) {
      rows = rows.slice(0, this.limitValue);
    }
    return rows;
  }

  private applyUpdate(): Promise<{ data: null; error: null }> {
    const patch = this.updateValue ?? {};
    const matched = this.match();
    for (const row of matched) {
      for (const [key, value] of Object.entries(patch)) {
        (row as unknown as Record<string, unknown>)[key] = value;
      }
    }
    return Promise.resolve({ data: null, error: null });
  }

  then(resolve: (value: unknown) => unknown, reject: (reason?: unknown) => void): Promise<unknown> {
    if (this.updateValue) {
      return this.applyUpdate().then((result) => resolve(result));
    }
    return Promise.resolve(this).then(resolve, reject);
  }
}

function createMockClient(seed: MockPairingRow[] = []) {
  const store: MockPairingRow[] = seed.map(cloneRow);
  const calls: unknown[] = [];
  let rowSeq = 0;

  const client = {
    from: (table: string): MockQueryBuilder => {
      if (table !== "madrasati_pairings") {
        throw new Error(`Unexpected table: ${table}`);
      }
      return new MockQueryBuilder(store, calls, () => `pairing-${++rowSeq}`);
    },
  };

  return {
    client: client as unknown as Pick<TypedSupabaseClient, "from">,
    calls,
    getRows: () => store.map(cloneRow),
    rowCount: () => store.length,
  };
}

interface TestHarness {
  now: Date;
  tokens: string[];
  logged: string[];
  service: MadrasatiPairingService;
  db: ReturnType<typeof createMockClient>;
  context: (userId: string) => SupabaseUserContext;
}

function createHarness(seed: MockPairingRow[] = []): TestHarness {
  const now = new Date("2026-09-05T12:00:00.000Z");
  const tokens: string[] = [];
  let tokenCounter = 0;
  const logged: string[] = [];

  const db = createMockClient(seed);

  const service = new MadrasatiPairingService({
    now: () => now,
    generateToken: () => {
      const token = `test-token-${String(++tokenCounter).padStart(6, "0")}`;
      tokens.push(token);
      return token;
    },
    logger: (message) => logged.push(message),
  });

  return {
    now,
    tokens,
    logged,
    service,
    db,
    context: (userId) => ({
      client: db.client as unknown as TypedSupabaseClient,
      userId,
    }),
  };
}

function seedPendingPairing(
  db: TestHarness["db"],
  overrides: Partial<MockPairingRow> = {},
): { row: MockPairingRow; token: string } {
  const token = overrides.token_hash ? null : `seed-token-${cryptoRandomishSuffix()}`;
  const row: MockPairingRow = {
    id: `seed-${token ?? "record"}`,
    user_id: "user-A",
    token_hash: overrides.token_hash ?? hashMadrasatiPairingToken(token as string),
    status: "pending",
    created_at: "2026-09-05T11:00:00.000Z",
    expires_at: "2026-09-05T12:30:00.000Z",
    paired_at: null,
    revoked_at: null,
    last_used_at: null,
    ...overrides,
  };
  db.client.from("madrasati_pairings").insert(row).maybeSingle();
  return { row, token: token as string };
}

function cryptoRandomishSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("MadrasatiPairingService", () => {
  describe("TTL validation (pairing-contract)", () => {
    it("defaults to 15 minutes when omitted", () => {
      assert.equal(validateMadrasatiPairingTtl(undefined), MADRASATI_PAIRING_TTL_SECONDS_DEFAULT);
      assert.equal(validateMadrasatiPairingTtl(null), MADRASATI_PAIRING_TTL_SECONDS_DEFAULT);
    });

    it("accepts an in-range integer", () => {
      assert.equal(validateMadrasatiPairingTtl(120), 120);
    });

    it("rejects TTL below the minimum", () => {
      assert.throws(
        () => validateMadrasatiPairingTtl(MADRASATI_PAIRING_TTL_SECONDS_MIN - 1),
        RangeError,
      );
    });

    it("rejects non-integer TTL", () => {
      assert.throws(() => validateMadrasatiPairingTtl(90.5), RangeError);
    });

    it("start rejects out-of-range ttlSeconds with RangeError", async () => {
      const h = createHarness();
      await assert.rejects(h.service.start(h.context("user-A"), { ttlSeconds: 30 }), RangeError);
      assert.equal(h.db.rowCount(), 0, "no pairing should be created");
    });
  });

  describe("start", () => {
    it("creates a pending pairing owned by the authenticated user", async () => {
      const h = createHarness();
      const result = await h.service.start(h.context("user-A"));

      assert.match(result.token, /^test-token-\d{6}$/);
      assert.equal(result.state, "pending");
      assert.ok(result.pairingId);

      const rows = h.db.getRows();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].user_id, "user-A", "owner is always the authenticated user");
      assert.equal(rows[0].status, "pending");
      assert.equal(rows[0].created_at, h.now.toISOString());
      assert.equal(rows[0].expires_at, new Date(h.now.getTime() + 15 * 60 * 1000).toISOString());
    });

    it("persists only the SHA-256 hash of the token, never the token itself", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"));

      const rows = h.db.getRows();
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token_hash, h.tokens[0], "raw token must not be stored");
      assert.equal(rows[0].token_hash, hashMadrasatiPairingToken(h.tokens[0]));
    });

    it("honors a custom ttlSeconds for expiresAt", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"), { ttlSeconds: 60 });

      const rows = h.db.getRows();
      assert.equal(rows[0].expires_at, new Date(h.now.getTime() + 60 * 1000).toISOString());
    });

    it("revokes the previous active pairing before creating a new one", async () => {
      const h = createHarness();
      const first = await h.service.start(h.context("user-A"));
      const second = await h.service.start(h.context("user-A"));

      const rows = h.db.getRows();
      assert.equal(rows.length, 2);
      const firstRow = rows.find((row) => row.id === first.pairingId);
      const secondRow = rows.find((row) => row.id === second.pairingId);
      assert.equal(firstRow?.status, "revoked");
      assert.ok(firstRow?.revoked_at);
      assert.equal(secondRow?.status, "pending");
      assert.equal(secondRow?.revoked_at, null);

      const claimOfFirst = await h.service.claim(
        h.db.client as unknown as TypedSupabaseClient,
        h.tokens[0],
      );
      assert.ok(!claimOfFirst.ok);
      assert.equal(claimOfFirst.code, "revoked");
    });

    it("rejects when there is no authenticated user", async () => {
      const h = createHarness();
      await assert.rejects(
        h.service.start(h.context("")),
        /Unauthorized: missing authenticated user/,
      );
      await assert.rejects(
        h.service.start(h.context("   ")),
        /Unauthorized: missing authenticated user/,
      );
      assert.equal(h.db.rowCount(), 0);
    });
  });

  describe("status", () => {
    it("returns null for a user with no pairing history", async () => {
      const h = createHarness();
      const status = await h.service.status(h.context("user-A"));
      assert.equal(status, null);
    });

    it("returns pending state and never exposes the token or its hash", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"));

      const status = await h.service.status(h.context("user-A"));
      assert.ok(status);
      assert.equal(status.state, "pending");
      assert.equal(status.expiresAt, h.db.getRows()[0].expires_at);
      assert.equal(status.lastVerifiedAt, h.now.toISOString());

      const serialized = JSON.stringify(status);
      assert.ok(!("token" in (status as object)));
      assert.ok(!("tokenHash" in (status as object)));
      assert.doesNotMatch(serialized, /test-token/);
      assert.doesNotMatch(serialized, /[0-9a-f]{64}/, "hash must not leak");
    });

    it("marks an expired pending pairing as expired and persists it", async () => {
      const h = createHarness();
      seedPendingPairing(h.db, {
        expires_at: "2026-09-05T11:30:00.000Z",
      });

      const status = await h.service.status(h.context("user-A"));

      assert.ok(status);
      assert.equal(status.state, "expired");
      assert.equal(status.revokedAt, undefined);
      const rows = h.db.getRows();
      assert.equal(rows[0].status, "expired", "expired transition must be persisted");
    });

    it("returns paired with pairedAt once claimed", async () => {
      const h = createHarness();
      const started = await h.service.start(h.context("user-A"));
      await h.service.claim(h.db.client as unknown as TypedSupabaseClient, started.token);

      const status = await h.service.status(h.context("user-A"));
      assert.ok(status);
      assert.equal(status.state, "paired");
      assert.equal(status.pairedAt, h.now.toISOString());
    });

    it("returns null for a different user (pairing not cross-accessible)", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"));

      const statusB = await h.service.status(h.context("user-B"));
      assert.equal(statusB, null);
    });
  });

  describe("revoke", () => {
    it("revokes active pairings for the caller only", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"));
      await h.service.start(h.context("user-B"));

      await h.service.revoke(h.context("user-A"));

      const rows = h.db.getRows();
      const rowsOfA = rows.filter((row) => row.user_id === "user-A");
      const rowsOfB = rows.filter((row) => row.user_id === "user-B");
      assert.ok(rowsOfA.every((row) => row.status === "revoked"));
      assert.ok(rowsOfA.every((row) => row.revoked_at === h.now.toISOString()));
      assert.ok(
        rowsOfB.every((row) => row.status === "pending"),
        "other user untouched",
      );
    });

    it("never exposes the token in the revoke result", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"));

      const status = await h.service.revoke(h.context("user-A"));
      assert.ok(status);
      assert.equal(status.state, "revoked");
      assert.doesNotMatch(JSON.stringify(status), /test-token/);
    });
  });

  describe("claim (extension handshake)", () => {
    it("binds the pairing to the owner row and returns paired state", async () => {
      const h = createHarness();
      const started = await h.service.start(h.context("user-A"));

      const result = await h.service.claim(
        h.db.client as unknown as TypedSupabaseClient,
        started.token,
      );

      assert.ok(result.ok);
      if (result.ok) {
        assert.equal(result.pairingId, started.pairingId);
        assert.equal(result.state, "paired");
        assert.equal(result.pairedAt, h.now.toISOString());
      }

      const rows = h.db.getRows();
      const claimed = rows.find((row) => row.id === started.pairingId);
      assert.equal(claimed?.status, "paired");
      assert.equal(claimed?.user_id, "user-A", "owner is derived from the record");
      assert.equal(claimed?.last_used_at, h.now.toISOString());

      // Claim result is purely token-driven: no user_id field is exposed.
      const claimJson = JSON.stringify(result);
      assert.doesNotMatch(claimJson, /user_id/);
    });

    it("is idempotent: claiming an already-paired token succeeds and keeps pairedAt", async () => {
      const h = createHarness();
      const started = await h.service.start(h.context("user-A"));
      await h.service.claim(h.db.client as unknown as TypedSupabaseClient, started.token);
      const second = await h.service.claim(
        h.db.client as unknown as TypedSupabaseClient,
        started.token,
      );

      assert.ok(second.ok);
      if (second.ok) {
        assert.equal(second.pairedAt, h.now.toISOString());
      }
      const rows = h.db.getRows();
      assert.equal(rows[0].status, "paired");
    });

    it("serves an expired pending token as expired and persists it", async () => {
      const h = createHarness();
      const { token } = seedPendingPairing(h.db, {
        expires_at: "2026-09-05T11:30:00.000Z",
      });

      const result = await h.service.claim(h.db.client as unknown as TypedSupabaseClient, token);

      assert.ok(!result.ok);
      assert.equal(result.code, "expired");
      assert.equal(result.message, "انتهت صلاحية رمز الاقتران");
      const rows = h.db.getRows();
      assert.equal(rows[0].status, "expired");
    });

    it("serves a revoked token as revoked", async () => {
      const h = createHarness();
      const { token } = seedPendingPairing(h.db, {
        id: "revoked-pairing",
        status: "revoked",
        revoked_at: "2026-09-05T11:40:00.000Z",
      });

      const result = await h.service.claim(h.db.client as unknown as TypedSupabaseClient, token);

      assert.ok(!result.ok);
      assert.equal(result.code, "revoked");
      assert.equal(result.message, "تم إلغاء هذا الاقتران");
    });

    it("serves an unknown token as not found", async () => {
      const h = createHarness();
      const result = await h.service.claim(
        h.db.client as unknown as TypedSupabaseClient,
        "unknown-token-000000000000000000000000000000",
      );
      assert.ok(!result.ok);
      assert.equal(result.code, "not_found");
    });

    it("rejects empty or whitespace-only tokens without a lookup", async () => {
      const h = createHarness();
      await h.service.start(h.context("user-A"));

      const eqCallsBefore = h.db.calls.filter(
        (call) => (call as { op?: string }).op === "eq",
      ).length;

      const empty = await h.service.claim(h.db.client as unknown as TypedSupabaseClient, "");
      assert.ok(!empty.ok);
      assert.equal(empty.code, "not_found");

      const blank = await h.service.claim(h.db.client as unknown as TypedSupabaseClient, "   ");
      assert.ok(!blank.ok);
      assert.equal(blank.code, "not_found");

      const eqCallsAfter = h.db.calls.filter(
        (call) => (call as { op?: string }).op === "eq",
      ).length;
      assert.equal(eqCallsAfter, eqCallsBefore, "no queries for invalid tokens");
    });

    it("a revoked pairing for one user cannot be claimed (owner binding intact)", async () => {
      const h = createHarness();
      const startedA = await h.service.start(h.context("user-A"));
      await h.service.start(h.context("user-B"));
      await h.service.revoke(h.context("user-A"));

      const result = await h.service.claim(
        h.db.client as unknown as TypedSupabaseClient,
        startedA.token,
      );
      assert.ok(!result.ok);
      assert.equal(result.code, "revoked");
    });
  });

  describe("logging", () => {
    it("never logs the raw token or its hash across a full lifecycle", async () => {
      const h = createHarness();
      const started = await h.service.start(h.context("user-A"));
      await h.service.status(h.context("user-A"));
      await h.service.claim(h.db.client as unknown as TypedSupabaseClient, started.token);
      await h.service.status(h.context("user-A"));
      await h.service.revoke(h.context("user-A"));

      const hash = hashMadrasatiPairingToken(started.token);
      assert.ok(h.logged.length > 0, "lifecycle should produce log lines");
      for (const line of h.logged) {
        assert.ok(!line.includes(started.token), `token leaked into log: ${line}`);
        assert.ok(!line.includes(hash), `hash leaked into log: ${line}`);
      }
    });
  });
});
