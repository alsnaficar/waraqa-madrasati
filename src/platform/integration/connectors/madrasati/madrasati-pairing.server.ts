import type { SupabaseUserContext } from "../../../../platform/database/supabase/context";
import type { TypedSupabaseClient } from "../../../../platform/database/supabase/context";
import {
  MadrasatiPairingService,
  type MadrasatiPairingClaimResult,
  type MadrasatiPairingStartResult,
} from "../../../../features/madrasati/pairing/madrasati-pairing.service";
import type { PairingStatus } from "../../../../features/madrasati/types";

function requireAuthenticatedUserId(userId: string): string {
  if (!userId || typeof userId !== "string" || !userId.trim()) {
    throw new Error("Unauthorized: missing authenticated user");
  }
  return userId.trim();
}

/**
 * Server-side Madrasati Extension ↔ Waragh pairing.
 *
 * The user id must always come from requireSupabaseAuth — never from
 * client/extension input. The extension handshake (claim) is gated only by
 * token possession; the pairing's owner is read from the record.
 */
export async function startAuthenticatedMadrasatiPairing(
  waraqaUserId: string,
  supabase: SupabaseUserContext["client"],
  options?: { ttlSeconds?: number | null },
): Promise<MadrasatiPairingStartResult> {
  requireAuthenticatedUserId(waraqaUserId);

  return new MadrasatiPairingService().start({ client: supabase, userId: waraqaUserId }, options);
}

export async function getAuthenticatedMadrasatiPairingStatus(
  waraqaUserId: string,
  supabase: SupabaseUserContext["client"],
): Promise<PairingStatus | null> {
  requireAuthenticatedUserId(waraqaUserId);

  return new MadrasatiPairingService().status({ client: supabase, userId: waraqaUserId });
}

export async function revokeAuthenticatedMadrasatiPairing(
  waraqaUserId: string,
  supabase: SupabaseUserContext["client"],
): Promise<PairingStatus | null> {
  requireAuthenticatedUserId(waraqaUserId);

  return new MadrasatiPairingService().revoke({ client: supabase, userId: waraqaUserId });
}

/**
 * Extension handshake. Accepts only the high-entropy pairing token; the
 * pairing's owner is derived server-side from the record. No user_id is
 * ever accepted from the caller.
 */
export async function claimMadrasatiPairing(
  supabase: TypedSupabaseClient,
  token: string,
): Promise<MadrasatiPairingClaimResult> {
  return new MadrasatiPairingService().claim(supabase, token);
}
