import { Button, Heading, Text } from "@react-email/components";

import { brand } from "../../components/brand";
import { EmailLayout } from "../../components/email-layout";

export type ProgressReportReadyEmailProps = {
  childName: string;
  /** "Term 1". */
  termLabel: string;
  /** "2026–27". */
  academicYearName: string;
  /** The Parent's home in the app. */
  url: string;
};

export function progressReportReadySubject({
  childName,
  termLabel,
}: ProgressReportReadyEmailProps): string {
  return `${childName}'s ${termLabel} Progress Report is ready`;
}

/** A Preschool tells a Parent that a term's Progress Report is published. */
export function ProgressReportReadyEmail(props: ProgressReportReadyEmailProps) {
  const subject = progressReportReadySubject(props);
  return (
    <EmailLayout preview={subject}>
      <Heading as="h1" style={styles.heading}>
        {subject}
      </Heading>
      <Text style={styles.text}>
        {props.childName}&apos;s Teacher has written the {props.termLabel}{" "}
        Progress Report for {props.academicYearName}: how {props.childName} is
        doing in each area of development, with the Teacher&apos;s remarks.
      </Text>
      <Button href={props.url} style={styles.button}>
        Read the Progress Report
      </Button>
      <Text style={styles.small}>
        If the button does not work, open {props.url}
      </Text>
    </EmailLayout>
  );
}

ProgressReportReadyEmail.PreviewProps = {
  childName: "Aarav",
  termLabel: "Term 1",
  academicYearName: "2026–27",
  url: "https://app.example.com/preschool/family",
} satisfies ProgressReportReadyEmailProps;

export default ProgressReportReadyEmail;

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
