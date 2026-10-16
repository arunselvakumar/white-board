import { Heading, Section, Text } from "@react-email/components";

import { brand } from "../../components/brand";
import { EmailLayout } from "../../components/email-layout";
import { CONSTRUCTION } from "./product";

export type CompanyCodePurpose =
  "verify-email" | "reset-password" | "confirm-action";

export type CompanyCodeEmailProps = {
  code: string;
  purpose: CompanyCodePurpose;
  expiresInMinutes: number;
  /**
   * For `confirm-action`: what the code allows, finishing "Enter this code
   * to …", e.g. "transfer ownership of Anugraha Engineers" (CM-907).
   */
  action?: string;
};

const COPY: Record<
  CompanyCodePurpose,
  { preview: string; heading: string; body: string }
> = {
  "verify-email": {
    preview: "Your Construction Management verification code",
    heading: "Verify your email",
    body: "Enter this code to verify your email address.",
  },
  "reset-password": {
    preview: "Your Construction Management password reset code",
    heading: "Reset your password",
    body: "Enter this code to choose a new password.",
  },
  "confirm-action": {
    preview: "Your Construction Management confirmation code",
    heading: "Confirm it is you",
    body: "Enter this code to continue.",
  },
};

/** The emailed 6-digit code for Construction Management (CM-119). */
export function CompanyCodeEmail({
  code,
  purpose,
  expiresInMinutes,
  action,
}: CompanyCodeEmailProps) {
  const copy = COPY[purpose];
  const body =
    purpose === "confirm-action" && action != null
      ? `Enter this code to ${action}. If you did not ask for it, ignore this email.`
      : copy.body;
  return (
    <EmailLayout preview={copy.preview} product={CONSTRUCTION}>
      <Heading as="h1" style={styles.heading}>
        {copy.heading}
      </Heading>
      <Text style={styles.text}>{body}</Text>
      <Section style={styles.codeBox}>
        <Text style={styles.code}>{code}</Text>
      </Section>
      <Text style={styles.small}>
        The code expires in {expiresInMinutes} minutes. Never share it with
        anyone.
      </Text>
    </EmailLayout>
  );
}

CompanyCodeEmail.PreviewProps = {
  code: "482913",
  purpose: "verify-email",
  expiresInMinutes: 10,
} satisfies CompanyCodeEmailProps;

export default CompanyCodeEmail;

const styles = {
  heading: {
    color: brand.ink,
    fontSize: "22px",
    fontWeight: 600,
    margin: "0 0 12px",
  },
  text: {
    color: brand.ink,
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 20px",
  },
  codeBox: {
    backgroundColor: brand.canvas,
    borderRadius: "10px",
    padding: "12px",
  },
  code: {
    color: brand.ink,
    fontSize: "30px",
    fontWeight: 600,
    letterSpacing: "8px",
    margin: 0,
    textAlign: "center" as const,
  },
  small: {
    color: brand.muted,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "20px 0 0",
  },
};
