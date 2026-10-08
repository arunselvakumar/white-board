/**
 * Mobile numbers for sign-in (ADR CM-0002), stored in E.164. Indian numbers
 * are +91 and ten digits starting 6–9; other countries are 8–15 digits.
 */
const E164 = /^\+[1-9]\d{7,14}$/;
const INDIA = /^\+91[6-9]\d{9}$/;

export function isValidMobile(value: string): boolean {
  if (!E164.test(value)) return false;
  if (value.startsWith("+91")) return INDIA.test(value);
  return true;
}

/**
 * `98765 43210`, `+91-98765-43210`, `09876543210` → `+919876543210`. A bare
 * ten-digit number is taken as Indian. Returns null when it is not a mobile.
 */
export function normalizeMobile(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  let candidate: string;
  if (trimmed.startsWith("+")) candidate = `+${digits}`;
  else if (digits.length === 10) candidate = `+91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0"))
    candidate = `+91${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith("91"))
    candidate = `+${digits}`;
  else candidate = `+${digits}`;
  return isValidMobile(candidate) ? candidate : null;
}

/** Better Auth needs an email on every User; a mobile sign-up gets this one. */
export function placeholderEmailFor(mobile: string): string {
  return `${mobile.replace(/[^\d]/g, "")}@mobile.invalid`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith("@mobile.invalid");
}

/** `+91 98765 43210` for screens. */
export function formatMobile(mobile: string): string {
  if (INDIA.test(mobile)) return `+91 ${mobile.slice(3, 8)} ${mobile.slice(8)}`;
  return mobile;
}
