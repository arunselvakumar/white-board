/**
 * SMS — mobile OTP sign-in and SMS invitations — is off until the Company
 * behind the product has a DLT-registered SMS sender (ADR CM-0009). Set
 * `CONSTRUCTION_SMS=on` to turn both back on; nothing else changes.
 */
export function isConstructionSmsEnabled(): boolean {
  return process.env["CONSTRUCTION_SMS"] === "on";
}
