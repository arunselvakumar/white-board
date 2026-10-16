import { Button, Heading, Text } from "@react-email/components";

import { brand } from "../../components/brand";
import { EmailLayout } from "../../components/email-layout";
import { CONSTRUCTION } from "./product";

export type BackupReadyEmailProps = {
  companyName: string;
  /** The signed download link; it works for the requester only. */
  downloadUrl: string;
  /** "23 Oct 2026". */
  expiresOn: string;
  fileName: string;
};

/** A full Company backup is ready (CM-906, ADR CM-0021 §8). */
export function BackupReadyEmail({
  companyName,
  downloadUrl,
  expiresOn,
  fileName,
}: BackupReadyEmailProps) {
  return (
    <EmailLayout
      preview={`Your full backup of ${companyName} is ready`}
      product={CONSTRUCTION}
    >
      <Heading as="h1" style={styles.heading}>
        Your Company backup is ready
      </Heading>
      <Text style={styles.text}>
        The full backup of {companyName} you asked for is ready to download (
        {fileName}). The link works until {expiresOn}, and only when you are
        signed in.
      </Text>
      <Button href={downloadUrl} style={styles.button}>
        Download the backup
      </Button>
      <Text style={styles.small}>
        If you did not ask for this backup, sign in and change your password.
        If the button does not work, open {downloadUrl}
      </Text>
    </EmailLayout>
  );
}

BackupReadyEmail.PreviewProps = {
  companyName: "Patil Builders",
  downloadUrl:
    "https://app.example.com/api/construction/reporting/backups/0190f1c2/download?expires=1792000000&sig=abc",
  expiresOn: "23 Oct 2026",
  fileName: "company-backup-2026-10-16.zip",
} satisfies BackupReadyEmailProps;

export default BackupReadyEmail;

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
    margin: "0 0 24px",
  },
  button: {
    backgroundColor: brand.primary,
    borderRadius: "10px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 20px",
    textDecoration: "none",
  },
  small: {
    color: brand.muted,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "24px 0 0",
    wordBreak: "break-all" as const,
  },
};
