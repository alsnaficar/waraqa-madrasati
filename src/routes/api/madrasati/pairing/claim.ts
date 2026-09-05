import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/**
 * Madrasati Extension ↔ Waragh pairing bridge (claim step).
 *
 * Follows the existing HTTP-route pattern in this repo
 * (`src/routes/api/madrasati/live-session.ts`): a plain
 * `createFileRoute` with `server.handlers` keyed by HTTP method.
 *
 * Security contract:
 *   - The caller's Origin must exactly equal `MADRASATI_EXTENSION_ORIGIN`.
 *     Missing env, missing Origin, or mismatch → 403 (fail closed, no
 *     wildcard). OPTIONS returns the allowlisted CORS headers only.
 *   - POST accepts `{ token }` only. No user_id, no cookies, no Supabase
 *     session. The pairing's owner is derived server-side by
 *     `MadrasatiPairingService` (commit 113e66b).
 *   - The token, its hash, and the owner's user_id are never returned or
 *     logged.
 */

const allowedOrigin = () => process.env.MADRASATI_EXTENSION_ORIGIN || "";
const trustedIpHeader = () => process.env.MADRASATI_TRUSTED_IP_HEADER || "";

export const Route = createFileRoute("/api/madrasati/pairing/claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleMadrasatiPairingClaim } = await import(
          "../../../../platform/integration/connectors/madrasati/madrasati-pairing.claim-handler.ts"
        );
        return handleMadrasatiPairingClaim(request, {
          allowedOrigin: allowedOrigin(),
          trustedIpHeader: trustedIpHeader(),
        });
      },
      OPTIONS: async () => {
        const { handleMadrasatiPairingOptions } = await import(
          "../../../../platform/integration/connectors/madrasati/madrasati-pairing.claim-handler.ts"
        );
        return handleMadrasatiPairingOptions(allowedOrigin());
      },
    },
  },
});