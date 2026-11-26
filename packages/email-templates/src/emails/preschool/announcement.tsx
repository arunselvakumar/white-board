import { Button, Heading, Text } from "@react-email/components";

import { brand } from "../../components/brand";
import { EmailLayout } from "../../components/email-layout";

export type AnnouncementEmailProps = {
  title: string;
  /** "Notice", "Event" or "Holiday". */
  kindLabel: string;
  /** As written; each line becomes a paragraph. */
  body: string;
  /** "25 Dec 2026" for an event or holiday; null for a notice. */
  dateText: string | null;
  /** The Parent's home in the app. */
  url: string;
};

export function announcementSubject({
  title,
  kindLabel,
}: AnnouncementEmailProps): string {
  return `${kindLabel}: ${title}`;
}

/** A Preschool Announcement, emailed to the Parents it reaches. */
export function AnnouncementEmail(props: AnnouncementEmailProps) {
  const lines = props.body.split(/\r?\n/).filter((line) => line.trim() !== "");
  return (
    <EmailLayout preview={announcementSubject(props)}>
      <Text style={styles.kicker}>
        {props.kindLabel}
        {props.dateText == null ? null : ` · ${props.dateText}`}
      </Text>
      <Heading as="h1" style={styles.heading}>
        {props.title}
      </Heading>
      {lines.map((line, index) => (
        <Text key={`${String(index)}-${line}`} style={styles.text}>
          {line}
        </Text>
      ))}
      <Button href={props.url} style={styles.button}>
        Open Whiteboard
      </Button>
      <Text style={styles.small}>
        If the button does not work, open {props.url}
      </Text>
    </EmailLayout>
  );
}

AnnouncementEmail.PreviewProps = {
  title: "Annual Day rehearsal",
  kindLabel: "Event",
  body: "Children rehearse on stage this Saturday.\nPlease send them in their Annual Day costume.",
  dateText: "12 Dec 2026",
  url: "https://app.example.com/preschool/family",
} satisfies AnnouncementEmailProps;

export default AnnouncementEmail;

const styles = {
  kicker: {
    color: brand.muted,
    fontSize: "13px",
    fontWeight: 600,
    margin: "0 0 4px",
  },
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
    margin: "0 0 12px",
  },
  button: {
    backgroundColor: brand.primary,
    borderRadius: "10px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    margin: "12px 0 0",
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
