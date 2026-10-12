import { Button, Heading, Link, Section, Text } from "@react-email/components";

import { brand } from "../components/brand";
import { EmailLayout } from "../components/email-layout";

/** One Class, as local date and times in the Batch's timezone. */
export type AbsenceNoticeEmailClass = {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  startTime: string;
  endTime: string;
};

export type AbsenceNoticeEmailProps = {
  /** Notice given, or a notice withdrawn. */
  kind: "given" | "withdrawn";
  studentName: string;
  batchName: string;
  courseName: string;
  classes: AbsenceNoticeEmailClass[];
  /** The reason's label, such as "Family function". */
  reasonLabel: string;
  note: string | null;
  /** Who gave the notice, or withdrew it. */
  by: { role: "student" | "parent"; name: string };
  /** The Teacher's Absence Notices page. */
  noticesUrl: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function clock(value: string): { time: string; period: "am" | "pm" } {
  const [hourText = "0", minute = "00"] = value.split(":");
  const hour = Number(hourText);
  return {
    time: `${String(hour % 12 === 0 ? 12 : hour % 12)}:${minute}`,
    period: hour < 12 ? "am" : "pm",
  };
}

/** "Thu 16 Oct, 5:00–6:00 pm", from a local date and times. */
export function formatNoticeClass(value: AbsenceNoticeEmailClass): string {
  const date = new Date(`${value.date}T00:00:00.000Z`);
  const day = `${WEEKDAYS[date.getUTCDay()] ?? ""} ${String(date.getUTCDate())} ${MONTHS[date.getUTCMonth()] ?? ""}`;
  const start = clock(value.startTime);
  const end = clock(value.endTime);
  const times =
    start.period === end.period
      ? `${start.time}–${end.time} ${end.period}`
      : `${start.time} ${start.period}–${end.time} ${end.period}`;
  return `${day}, ${times}`;
}

const ROLE_LABEL = { student: "Student", parent: "Parent" } as const;

function classWord(count: number): string {
  return count === 1 ? "Class" : "Classes";
}

export function absenceNoticeSubject(props: AbsenceNoticeEmailProps): string {
  const only = props.classes.length === 1 ? props.classes[0] : undefined;
  const what =
    only != null
      ? `${props.batchName} on ${formatNoticeClass(only)}`
      : `${String(props.classes.length)} Classes of ${props.batchName}`;
  return props.kind === "given"
    ? `Absence Notice: ${props.studentName} will miss ${what}`
    : `Absence Notice withdrawn: ${props.studentName}, ${what}`;
}

/** Tells a Teacher about an Absence Notice given or withdrawn (ADR-0041). */
export function AbsenceNoticeEmail({
  kind,
  studentName,
  batchName,
  courseName,
  classes,
  reasonLabel,
  note,
  by,
  noticesUrl,
}: AbsenceNoticeEmailProps) {
  const who = `${by.name} (${ROLE_LABEL[by.role]})`;
  const count = classes.length;
  return (
    <EmailLayout
      preview={
        kind === "given"
          ? `${studentName} will miss ${String(count)} ${classWord(count)} of ${batchName}`
          : `${who} withdrew an Absence Notice for ${studentName}`
      }
    >
      <Heading as="h1" style={styles.heading}>
        {kind === "given"
          ? `${studentName} will miss ${count === 1 ? "a Class" : `${String(count)} Classes`}`
          : "Absence Notice withdrawn"}
      </Heading>
      <Text style={styles.text}>
        {kind === "given"
          ? `${studentName} will miss ${count === 1 ? "this Class" : "these Classes"} of ${batchName} (${courseName}). Notice given by ${who}.`
          : `The notice that ${studentName} would miss ${count === 1 ? "this Class" : "these Classes"} of ${batchName} (${courseName}) was withdrawn by ${who}.`}
      </Text>
      <Section style={styles.panel}>
        {classes.map((value) => (
          <Text
            key={`${value.date} ${value.startTime}`}
            style={styles.classLine}
          >
            {formatNoticeClass(value)}
          </Text>
        ))}
        <Text style={styles.detail}>
          <strong>Reason:</strong> {reasonLabel}
        </Text>
        {note != null && note.length > 0 ? (
          <Text style={styles.detail}>
            <strong>Note:</strong> {note}
          </Text>
        ) : null}
      </Section>
      <Button href={noticesUrl} style={styles.button}>
        View Absence Notices
      </Button>
      <Text style={styles.small}>
        If the button doesn&apos;t work, open this link:
        <br />
        <Link href={noticesUrl} style={styles.link}>
          {noticesUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

AbsenceNoticeEmail.PreviewProps = {
  kind: "given",
  studentName: "Asha Kumar",
  batchName: "Evening Batch",
  courseName: "Tally",
  classes: [
    { date: "2026-10-15", startTime: "17:00", endTime: "18:00" },
    { date: "2026-10-16", startTime: "11:30", endTime: "13:00" },
  ],
  reasonLabel: "Family function",
  note: "Cousin's wedding in Madurai.",
  by: { role: "parent", name: "Ravi Kumar" },
  noticesUrl: "http://localhost:3001/teacher/absence-notices",
} satisfies AbsenceNoticeEmailProps;

export default AbsenceNoticeEmail;

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
    margin: "0 0 16px",
  },
  panel: {
    backgroundColor: brand.canvas,
    border: `1px solid ${brand.border}`,
    borderRadius: "10px",
    padding: "12px 16px",
    margin: "0 0 24px",
  },
  classLine: {
    color: brand.ink,
    fontSize: "15px",
    fontWeight: 600,
    lineHeight: "22px",
    margin: "0 0 4px",
  },
  detail: {
    color: brand.ink,
    fontSize: "14px",
    lineHeight: "22px",
    margin: "8px 0 0",
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
