import { Button, Heading, Text } from "@react-email/components";

import { brand } from "../../components/brand";
import { EmailLayout } from "../../components/email-layout";

export type DailyReportReadyEmailProps = {
  childName: string;
  /** "25 Nov 2026". */
  dateText: string;
  /** The report is for today, so the email says "Today's". */
  isToday: boolean;
  centreName: string | null;
  /** The Parent's home in the app. */
  reportUrl: string;
};

export function dailyReportReadySubject({
  childName,
  dateText,
  isToday,
}: DailyReportReadyEmailProps): string {
  return isToday
    ? `Today's Daily Report for ${childName} is ready`
    : `${childName}'s Daily Report for ${dateText} is ready`;
}

/** A Preschool tells a Parent that a Child's Daily Report is published. */
export function DailyReportReadyEmail(props: DailyReportReadyEmailProps) {
  const subject = dailyReportReadySubject(props);
  return (
    <EmailLayout preview={subject}>
      <Heading as="h1" style={styles.heading}>
        {subject}
      </Heading>
      <Text style={styles.text}>
        {props.centreName ?? "The preschool"} has shared {props.childName}
        &apos;s day for {props.dateText}: meals, nap, activities and a note from
        the Teacher.
      </Text>
      <Button href={props.reportUrl} style={styles.button}>
        Read the Daily Report
      </Button>
      <Text style={styles.small}>
        If the button does not work, open {props.reportUrl}
      </Text>
    </EmailLayout>
  );
}

DailyReportReadyEmail.PreviewProps = {
  childName: "Aarav",
  dateText: "25 Nov 2026",
  isToday: true,
  centreName: "Little Steps Anna Nagar",
  reportUrl: "https://app.example.com/preschool/family",
} satisfies DailyReportReadyEmailProps;

export default DailyReportReadyEmail;

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
