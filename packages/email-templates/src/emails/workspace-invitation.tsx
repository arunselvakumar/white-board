import { Button, Heading, Link, Text } from "@react-email/components";

import { brand } from "../components/brand";
import { EmailLayout } from "../components/email-layout";

export type InvitationRole = "teacher" | "student" | "parent";

export type WorkspaceInvitationEmailProps = {
  workspaceName: string;
  inviterName: string;
  role: InvitationRole;
  acceptUrl: string;
  expiresInDays: number;
};

const ROLE_COPY: Record<InvitationRole, { noun: string; what: string }> = {
  teacher: {
    noun: "a Teacher",
    what: "see your Batches, mark Attendance, and share Homework and Study Material",
  },
  student: {
    noun: "a Student",
    what: "see your Classes, Homework, Study Material, and fee dues",
  },
  parent: {
    noun: "a Parent",
    what: "follow your child's Classes, Attendance, Homework, and fee dues",
  },
};

export function WorkspaceInvitationEmail({
  workspaceName,
  inviterName,
  role,
  acceptUrl,
  expiresInDays,
}: WorkspaceInvitationEmailProps) {
  const copy = ROLE_COPY[role];
  return (
    <EmailLayout preview={`Join ${workspaceName} on Whiteboard`}>
      <Heading as="h1" style={styles.heading}>
        Join {workspaceName}
      </Heading>
      <Text style={styles.text}>
        {inviterName} invited you to {workspaceName} on Whiteboard as{" "}
        {copy.noun}. Once you join, you can {copy.what}.
      </Text>
      <Button href={acceptUrl} style={styles.button}>
        Accept invitation
      </Button>
      <Text style={styles.small}>
        This invitation expires in {expiresInDays}{" "}
        {expiresInDays === 1 ? "day" : "days"}. If the button doesn&apos;t work,
        open this link:
        <br />
        <Link href={acceptUrl} style={styles.link}>
          {acceptUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

WorkspaceInvitationEmail.PreviewProps = {
  workspaceName: "Sri Vidya Computer Centre",
  inviterName: "Arun",
  role: "student",
  acceptUrl: "http://localhost:3000/accept-invitation?id=example",
  expiresInDays: 7,
} satisfies WorkspaceInvitationEmailProps;

export default WorkspaceInvitationEmail;

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
  link: {
    color: brand.primary,
  },
};
