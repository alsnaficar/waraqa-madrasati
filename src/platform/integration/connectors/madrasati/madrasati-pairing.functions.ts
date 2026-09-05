import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/platform/database/supabase/auth-middleware";
import {
  MADRASATI_PAIRING_TTL_SECONDS_DEFAULT,
  MADRASATI_PAIRING_TTL_SECONDS_MAX,
  MADRASATI_PAIRING_TTL_SECONDS_MIN,
} from "@/features/madrasati/pairing/pairing-contract";
import type {
  MadrasatiPairingClaimResult,
  MadrasatiPairingStartResult,
} from "@/features/madrasati/pairing/madrasati-pairing.service";
import type { PairingStatus } from "@/features/madrasati/types";

/**
 * Madrasati Extension ↔ Waragh pairing server functions.
 *
 * Only the client-safe contract (constants + zod) and the auth middleware
 * are imported at top level — the service (node:crypto) and the service-role
 * client are loaded lazily inside handlers so they never reach the browser
 * bundle. Functions are registered for Phase 3 (extension + UI); nothing
 * else ships them into a route yet.
 */

const NoInputSchema = z.object({});

const MadrasatiPairingTtlSchema = z
  .number()
  .int()
  .min(MADRASATI_PAIRING_TTL_SECONDS_MIN)
  .max(MADRASATI_PAIRING_TTL_SECONDS_MAX)
  .optional()
  .default(MADRASATI_PAIRING_TTL_SECONDS_DEFAULT);

const StartMadrasatiPairingInput = z.object({
  ttlSeconds: MadrasatiPairingTtlSchema,
});

const ClaimMadrasatiPairingTokenSchema = z.string().min(32).max(128);

const ClaimMadrasatiPairingInput = z.object({
  token: ClaimMadrasatiPairingTokenSchema,
});

/** Starts a pairing for the authenticated Waraqa user; returns the raw token once. */
export const startMadrasatiPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => StartMadrasatiPairingInput.parse(data ?? {}))
  .handler(async ({ context, data }): Promise<MadrasatiPairingStartResult> => {
    const { startAuthenticatedMadrasatiPairing } =
      await import("@/platform/integration/connectors/madrasati/madrasati-pairing.server");
    return startAuthenticatedMadrasatiPairing(context.userId, context.supabase, {
      ttlSeconds: data.ttlSeconds,
    });
  });

/** Status of the caller's own pairing. Never includes the token or its hash. */
export const madrasatiPairingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => NoInputSchema.parse(data ?? {}))
  .handler(async ({ context }): Promise<{ pairing: PairingStatus | null }> => {
    const { getAuthenticatedMadrasatiPairingStatus } =
      await import("@/platform/integration/connectors/madrasati/madrasati-pairing.server");
    const pairing = await getAuthenticatedMadrasatiPairingStatus(context.userId, context.supabase);
    return { pairing };
  });

/** Revokes all active pairings of the caller. */
export const revokeMadrasatiPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => NoInputSchema.parse(data ?? {}))
  .handler(async ({ context }): Promise<{ pairing: PairingStatus | null }> => {
    const { revokeAuthenticatedMadrasatiPairing } =
      await import("@/platform/integration/connectors/madrasati/madrasati-pairing.server");
    const pairing = await revokeAuthenticatedMadrasatiPairing(context.userId, context.supabase);
    return { pairing };
  });

/**
 * Extension handshake: claims a pairing by its high-entropy token only.
 * Public — there is no Waragh session at this boundary. Access is gated by
 * token possession; the pairing's owner is derived server-side, never
 * accepted from the caller.
 */
export const claimMadrasatiPairing = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ClaimMadrasatiPairingInput.parse(data))
  .handler(async ({ data }): Promise<MadrasatiPairingClaimResult> => {
    const { claimMadrasatiPairing: claim } =
      await import("@/platform/integration/connectors/madrasati/madrasati-pairing.server");
    const { supabaseAdmin } = await import("@/platform/database/supabase/client.server");
    return claim(supabaseAdmin, data.token);
  });
