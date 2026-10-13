import { Heading, Text } from "@react-email/components";

import { brand } from "../components/brand";
import { EmailLayout } from "../components/email-layout";

export type ReportEmailProps = {
  /** Such as "Monthly student report for Rohan". */
  heading: string;
  /** Short paragraphs; the report itself is the attachment. */
  lines: string[];
};

/** A Report sent by the Owner, with the report attached (Reports §6.10). */
export function ReportEmail({ heading, lines }: ReportEmailProps) {
  return (
    <EmailLayout preview={heading}>
      <Heading as="h1" style={styles.heading}>
        {heading}
      </Heading>
      {lines.map((line) => (
        <Text key={line} style={styles.text}>
          {line}
        </Text>
      ))}
    </EmailLayout>
  );
}

ReportEmail.PreviewProps = {
  heading: "Monthly student report for Rohan Sharma",
  lines: [
    "Sunrise Computer Centre has sent Rohan Sharma's monthly student report.",
    "Period: 1 Oct 2026 – 31 Oct 2026.",
    "The report is attached as a PDF.",
  ],
} satisfies ReportEmailProps;

export default ReportEmail;

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
    margin: "0 0 12px",
  },
};
