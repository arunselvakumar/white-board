import type { RenderedEmail } from "@repo/email-templates";

export type CompanyCodePurpose = "verify-email" | "reset-password";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The emailed 6-digit code for Construction Management. Plain until the
 * React Email templates arrive (CM-119).
 */
export function renderCompanyCodeEmail(input: {
  code: string;
  purpose: CompanyCodePurpose;
  expiresInMinutes: number;
}): RenderedEmail {
  const what =
    input.purpose === "verify-email"
      ? "verify your email"
      : "reset your password";
  const subject =
    input.purpose === "verify-email"
      ? `${input.code} is your Construction Management verification code`
      : `${input.code} is your Construction Management password reset code`;
  const text = `Use ${input.code} to ${what}. The code expires in ${String(input.expiresInMinutes)} minutes. If you did not ask for it, ignore this email.`;
  return {
    subject,
    text,
    html: `<p>${escapeHtml(text)}</p>`,
  };
}
