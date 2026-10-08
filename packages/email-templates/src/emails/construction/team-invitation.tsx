import { Button, Heading, Text } from "@react-email/components";

import { brand } from "../../components/brand";
import { EmailLayout } from "../../components/email-layout";
import { CONSTRUCTION } from "./product";

export type TeamInvitationEmailProps = {
  companyName: string;
  memberName: string;
  designationName: string | null;
  joinUrl: string;
};

/** A Join Request for a new Team Member (CM-109, CM-119). */
export function TeamInvitationEmail({
  companyName,
  memberName,
  designationName,
  joinUrl,
}: TeamInvitationEmailProps) {
  return (
    <EmailLayout
      preview={`Join ${companyName} on Construction Management`}
      product={CONSTRUCTION}
    >
      <Heading as="h1" style={styles.heading}>
        Join {companyName}
      </Heading>
      <Text style={styles.text}>
        {memberName}, {companyName} has added you to their team
        {designationName == null ? "" : ` as ${designationName}`} on
        Construction Management.
      </Text>
      <Button href={joinUrl} style={styles.button}>
        Accept the invitation
      </Button>
      <Text style={styles.small}>
        Sign in with this email address, or with the mobile number the Company
        has for you, to accept. If the button does not work, open {joinUrl}
      </Text>
    </EmailLayout>
  );
}

TeamInvitationEmail.PreviewProps = {
  companyName: "Patil Builders",
  memberName: "Suresh Kale",
  designationName: "Site Engineer",
  joinUrl: "https://app.example.com/join/Zt0kenZt0kenZt0kenZt0ken",
} satisfies TeamInvitationEmailProps;

export default TeamInvitationEmail;

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
