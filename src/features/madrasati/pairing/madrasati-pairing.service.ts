import { createHash, randomBytes } from "node:crypto";

import type {
  SupabaseUserContext,
  TypedSupabaseClient,
} from "@/platform/database/supabase/context";
import type { PairingStatus } from "../types";
import {
  MADRASATI_PAIRING_STATUS_VALUES,
  MADRASATI_PAIRING_TOKEN_BYTES,
  MADRASATI_PAIRING_TTL_SECONDS_DEFAULT,
  MADRASATI_PAIRING_TTL_SECONDS_MAX,
  MADRASATI_PAIRING_TTL_SECONDS_MIN,
  validateMadrasatiPairingTtl,
  type MadrasatiPairingStatusValue,
} from "./pairing-contract";

export {
  MADRASATI_PAIRING_STATUS_VALUES,
  MADRASATI_PAIRING_TOKEN_BYTES,
  MADRASATI_PAIRING_TTL_SECONDS_DEFAULT,
  MADRASATI_PAIRING_TTL_SECONDS_MAX,
  MADRASATI_PAIRING_TTL_SECONDS_MIN,
  validateMadrasatiPairingTtl,
  type MadrasatiPairingStatusValue,
};

/**
 * Madrasati Extension ↔ Waragh pairing service.
 *
 * Server-only module (imports node:crypto). Not re-exported from the
 * feature barrel to keep the client bundle clean — called through
 * `connectors/madrasati/madrasati-pairing.server.ts` only.
 *
 * Security model:
 * - The pairing token is 256 bits of CSPRNG output; only its SHA-256
 *   hash is ever persisted.
 * - Starting/status/revoking require an authenticated Waraqa user that is
 *   derived server-side (context.userId) — never accepted from input.
 * - The claim step (future extension handshake) is gated purely by token
 *   possession and binds the pairing to the pairing row's owner; no
 *   user_id is ever accepted from a client.
 * - The raw token is returned exactly once (from start) and never from
 *   status/revoke/claim responses.
 * - Nothing is logged except fixed lifecycle strings; the token and hash
 *   are never passed to the logger.
 */

export type MadrasatiPairingLogger = (message: string) => void;

export interface MadrasatiPairingRow {
  id: string;
  user_id: string;
  token_hash: string;
  status: MadrasatiPairingStatusValue;
  created_at: string;
  expires_at: string;
  paired_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export interface MadrasatiPairingStartResult {
  token: string;
  expiresAt: string;
  pairingId: string;
  state: "pending";
}

export type MadrasatiPairingClaimResult =
  | { ok: true; pairingId: string; state: "paired"; pairedAt: string }
  | { ok: false; code: "expired" | "revoked" | "not_found"; message: string };

export interface MadrasatiPairingServiceOptions {
  /** Injectable clock for tests. */
  now?: () => Date;
  /** Injectable token generator for tests. */
  generateToken?: () => string;
  /** Injectable logger; never receives the token or its hash. */
  logger?: MadrasatiPairingLogger;
}

const PAIRING_MESSAGES = {
  pending: "بانتظار ربط إضافة المتصفح",
  paired: "تم ربط إضافة المتصفح بحسابك",
  revoked: "تم إلغاء الاقتران",
  expired: "انتهت صلاحية رمز الاقتران",
  noActive: "لا يوجد اقتران نشط",
  claimPaired: "تم ربط الحساب بإضافة المتصفح",
  claimExpired: "انتهت صلاحية رمز الاقتران",
  claimRevoked: "تم إلغاء هذا الاقتران",
  claimNotFound: "رمز الاقتران غير صالح",
} as const;

function defaultNow(): Date {
  return new Date();
}

function defaultGenerateToken(): string {
  return randomBytes(MADRASATI_PAIRING_TOKEN_BYTES).toString("base64url");
}

function defaultLogger(message: string): void {
  console.info(`[MadrasatiPairing] ${message}`);
}

/** SHA-256 hex digest of a pairing token. The digest is the only persisted form. */
export function hashMadrasatiPairingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function requireUserId(userId: string): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new Error("Unauthorized: missing authenticated user");
  }
  return userId.trim();
}

export class MadrasatiPairingService {
  private readonly now: () => Date;
  private readonly generateToken: () => string;
  private readonly log: MadrasatiPairingLogger;

  constructor(options: MadrasatiPairingServiceOptions = {}) {
    this.now = options.now ?? defaultNow;
    this.generateToken = options.generateToken ?? defaultGenerateToken;
    this.log = options.logger ?? defaultLogger;
  }

  /**
   * Starts a pairing for the authenticated user and returns the raw token
   * exactly once. Starting a new pairing revokes any previous active
   * (pending/paired) pairing for the same user.
   */
  async start(
    context: SupabaseUserContext,
    options: { ttlSeconds?: number | null } = {},
  ): Promise<MadrasatiPairingStartResult> {
    const userId = requireUserId(context.userId);
    const ttl = validateMadrasatiPairingTtl(options.ttlSeconds ?? null);
    const nowIso = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + ttl * 1000).toISOString();

    await this.revokeActivePairings(context.client, userId);

    const token = this.generateToken();
    const tokenHash = hashMadrasatiPairingToken(token);

    const { data, error } = await context.client
      .from("madrasati_pairings")
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
        created_at: nowIso,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      throw new Error("Failed to create Madrasati pairing record.");
    }

    const pairingId = data.id;
    this.log(`pairing started for user ${userId}`);
    this.log(`pairing ${pairingId} scheduled to expire at ${expiresAt}`);

    return {
      token,
      expiresAt,
      pairingId,
      state: "pending",
    };
  }

  /**
   * Status of the caller's own pairing. Never includes the token or its hash.
   * Returns null when the user has no pairing history.
   */
  async status(context: SupabaseUserContext): Promise<PairingStatus | null> {
    const userId = requireUserId(context.userId);

    const { data, error } = await context.client
      .from("madrasati_pairings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return null;
    }

    const row = data as unknown as MadrasatiPairingRow;
    const nowIso = this.now().toISOString();

    if (row.status === "pending" && nowIso > row.expires_at) {
      await this.setStatus(context.client, row.id, "expired");
      row.status = "expired";
    }

    return this.toPairingStatus(row, nowIso);
  }

  /**
   * Revokes all active (pending/paired) pairings of the caller. Returns the
   * resulting status of the caller's latest pairing, or null if none remains.
   */
  async revoke(context: SupabaseUserContext): Promise<PairingStatus | null> {
    const userId = requireUserId(context.userId);

    await this.revokeActivePairings(context.client, userId);

    return this.status(context);
  }

  /**
   * Claims a pairing by token (the future extension handshake). The owner is
   * derived from the pairing record — no user_id is accepted as input.
   * Idempotent: claiming an already-paired token succeeds again.
   */
  async claim(client: TypedSupabaseClient, token: string): Promise<MadrasatiPairingClaimResult> {
    if (!token || typeof token !== "string" || !token.trim()) {
      return { ok: false, code: "not_found", message: PAIRING_MESSAGES.claimNotFound };
    }

    const tokenHash = hashMadrasatiPairingToken(token);

    const { data, error } = await client
      .from("madrasati_pairings")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!data) {
      return { ok: false, code: "not_found", message: PAIRING_MESSAGES.claimNotFound };
    }

    const row = data as unknown as MadrasatiPairingRow;
    const nowIso = this.now().toISOString();

    if (row.status === "revoked") {
      return { ok: false, code: "revoked", message: PAIRING_MESSAGES.claimRevoked };
    }

    if (row.status === "pending" && nowIso > row.expires_at) {
      await this.setStatus(client, row.id, "expired");
      return { ok: false, code: "expired", message: PAIRING_MESSAGES.claimExpired };
    }

    const pairedAt = row.status === "paired" ? (row.paired_at ?? nowIso) : nowIso;
    await this.setStatus(client, row.id, "paired", { pairedAt });
    this.log(`pairing ${row.id} claimed for user ${row.user_id}`);

    return {
      ok: true,
      pairingId: row.id,
      state: "paired",
      pairedAt,
    };
  }

  private async revokeActivePairings(client: TypedSupabaseClient, userId: string): Promise<void> {
    const nowIso = this.now().toISOString();

    const { error } = await client
      .from("madrasati_pairings")
      .update({ status: "revoked", revoked_at: nowIso })
      .eq("user_id", userId)
      .in("status", ["pending", "paired"]);

    if (error) {
      throw error;
    }
  }

  private async setStatus(
    client: TypedSupabaseClient,
    pairingId: string,
    status: MadrasatiPairingStatusValue,
    timestamps: { pairedAt?: string } = {},
  ): Promise<void> {
    const nowIso = this.now().toISOString();

    const patch: {
      status: string;
      last_used_at?: string;
      paired_at?: string;
    } = { status };

    if (status === "paired") {
      patch.last_used_at = nowIso;
    }
    if (timestamps.pairedAt !== undefined) {
      patch.paired_at = timestamps.pairedAt;
    }

    const { error } = await client.from("madrasati_pairings").update(patch).eq("id", pairingId);

    if (error) {
      throw error;
    }
  }

  private toPairingStatus(row: MadrasatiPairingRow, nowIso: string): PairingStatus {
    const state = row.status;

    return {
      state,
      ...(state === "paired" && row.paired_at ? { pairedAt: row.paired_at } : {}),
      lastVerifiedAt: nowIso,
      expiresAt: row.expires_at,
      ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
      message: PAIRING_MESSAGES[state] ?? PAIRING_MESSAGES.noActive,
    };
  }
}
