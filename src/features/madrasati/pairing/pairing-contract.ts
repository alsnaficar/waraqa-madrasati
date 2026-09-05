/**
 * Madrasati Extension ↔ Waragh pairing contract constants and pure
 * validation. Client-safe (no node imports) so server functions can apply
 * the same bounds without pulling `node:crypto` into the browser bundle.
 */

export const MADRASATI_PAIRING_TOKEN_BYTES = 32;

export const MADRASATI_PAIRING_TTL_SECONDS_DEFAULT = 15 * 60;
export const MADRASATI_PAIRING_TTL_SECONDS_MIN = 60;
export const MADRASATI_PAIRING_TTL_SECONDS_MAX = 60 * 60;

export const MADRASATI_PAIRING_STATUS_VALUES = ["pending", "paired", "revoked", "expired"] as const;
export type MadrasatiPairingStatusValue = (typeof MADRASATI_PAIRING_STATUS_VALUES)[number];

/**
 * Validates and normalizes the pairing TTL (seconds).
 * Throws RangeError for non-integer or out-of-range values.
 */
export function validateMadrasatiPairingTtl(ttlSeconds: number | null | undefined): number {
  const ttl = ttlSeconds ?? MADRASATI_PAIRING_TTL_SECONDS_DEFAULT;

  if (!Number.isInteger(ttl)) {
    throw new RangeError("pairing TTL must be a whole number of seconds");
  }

  if (ttl < MADRASATI_PAIRING_TTL_SECONDS_MIN || ttl > MADRASATI_PAIRING_TTL_SECONDS_MAX) {
    throw new RangeError(
      `pairing TTL must be between ${MADRASATI_PAIRING_TTL_SECONDS_MIN} and ${MADRASATI_PAIRING_TTL_SECONDS_MAX} seconds`,
    );
  }

  return ttl;
}
