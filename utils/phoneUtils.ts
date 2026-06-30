// utils/phoneUtils.ts

/**
 * Normalizes any recognized Ghana phone number format to the
 * canonical INTERNATIONAL format: +233XXXXXXXXX (12 chars total).
 *
 * This is the format stored in the database (set at registration),
 * so every lookup must produce this same shape to match.
 *
 * Accepted inputs:
 *   "+233200805961"  -> "+233200805961"  (already canonical)
 *   "233200805961"   -> "+233200805961"  (missing plus)
 *   "0200805961"     -> "+233200805961"  (local format)
 *
 * Returns null for anything that doesn't match a known Ghana shape.
 */
export function normalizePhoneNumber(rawInput: string): string | null {
  // Strip whitespace and non-digit characters except a leading +
  const trimmed = rawInput.trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");

  // Case 1: already in full international format "+233" + 9 digits
  if (/^\+233\d{9}$/.test(digitsOnly)) {
    return digitsOnly; // already canonical, return as-is
  }

  // Case 2: "233" (no plus) + 9 digits -> prepend "+"
  if (/^233\d{9}$/.test(digitsOnly)) {
    return "+" + digitsOnly;
  }

  // Case 3: local format "0" + 9 digits -> replace leading 0 with "+233"
  if (/^0\d{9}$/.test(digitsOnly)) {
    return "+233" + digitsOnly.slice(1);
  }

  // Anything else is not a recognized Ghana number format
  return null;
}
