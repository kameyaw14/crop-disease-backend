// utils/phoneUtils.ts

export function normalizePhoneNumber(rawInput: string): string | null {
  // Strip whitespace and any non-digit characters except a leading +
  // (e.g. handles "+233 20 080 5961" or "0200-805-961")
  const trimmed = rawInput.trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");

  // Case 1: starts with "+233" followed by exactly 9 digits
  if (/^\+233\d{9}$/.test(digitsOnly)) {
    return "0" + digitsOnly.slice(4); // drop "+233", prepend "0"
  }

  // Case 2: starts with "233" (no plus) followed by exactly 9 digits
  if (/^233\d{9}$/.test(digitsOnly)) {
    return "0" + digitsOnly.slice(3); // drop "233", prepend "0"
  }

  // Case 3: already canonical, "0" followed by exactly 9 digits
  if (/^0\d{9}$/.test(digitsOnly)) {
    return digitsOnly; // already correct, used as-is
  }

  // Anything else is not a recognized Ghana number format
  return null;
}
