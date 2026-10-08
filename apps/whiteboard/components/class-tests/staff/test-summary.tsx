import { Badge } from "@repo/ui/components/badge";

import {
  formatMarks,
  type StaffClassTestView,
  type TestSummaryView,
} from "@/src/queries/class-tests";

import {
  marksOrDash,
  SINGLE_STUDENT_NUMBERS_NOTE,
  singleStudentLabel,
} from "./test-staff-format";

export function DraftBadge() {
  return (
    <Badge
      variant="outline"
      className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
    >
      Draft
    </Badge>
  );
}

export function PublishedBadge() {
  return (
    <Badge
      variant="outline"
      className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
    >
      Published
    </Badge>
  );
}

export function TestBadges({ test }: { test: StaffClassTestView }) {
  return (
    <>
      {test.publishedAt == null ? <DraftBadge /> : <PublishedBadge />}
      {test.scope === "student" && test.student != null ? (
        <Badge variant="secondary">
          {singleStudentLabel(test.student.name)}
        </Badge>
      ) : null}
    </>
  );
}

/** "18 of 20 tested · 1 absent · 1 exempt", plus "12 of 20 entered" on a draft. */
function CountLine({
  summary,
  draft,
}: {
  summary: TestSummaryView;
  draft: boolean;
}) {
  const incomplete = draft && summary.entered < summary.listed;
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {draft ? (
        <span
          className={
            incomplete ? "font-medium text-amber-800 dark:text-amber-200" : ""
          }
        >
          {summary.entered} of {summary.listed} entered
        </span>
      ) : null}
      <span>
        {summary.tested} of {summary.listed} tested
      </span>
      {summary.absent > 0 ? <span>{summary.absent} absent</span> : null}
      {summary.exempt > 0 ? <span>{summary.exempt} exempt</span> : null}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function NameRow({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
      <dt className="text-muted-foreground shrink-0 text-xs sm:w-32 sm:pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words">{names.join(", ")}</dd>
    </div>
  );
}

/**
 * Staff numbers for a Test. Average, highest, and lowest count scored
 * results only; a single-student Test is left out of Batch numbers.
 */
export function TestSummary({
  test,
  label = "Summary",
}: {
  test: StaffClassTestView;
  label?: string;
}) {
  const { summary } = test;
  const draft = test.publishedAt == null;
  const single = test.scope === "student";
  const names = {
    belowPass: summary.belowPass.map(
      (student) => `${student.name} (${formatMarks(student.marks)})`,
    ),
    absent: summary.absentStudents.map((student) => student.name),
    exempt: summary.exemptStudents.map((student) => student.name),
  };
  return (
    <section aria-label={label} className="space-y-3">
      <CountLine summary={summary} draft={draft} />
      {single ? (
        <p className="text-muted-foreground text-xs">
          {SINGLE_STUDENT_NUMBERS_NOTE}
        </p>
      ) : (
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Average" value={marksOrDash(summary.average)} />
          <Stat label="Highest" value={marksOrDash(summary.highest)} />
          <Stat label="Lowest" value={marksOrDash(summary.lowest)} />
        </dl>
      )}
      {names.belowPass.length + names.absent.length + names.exempt.length >
      0 ? (
        <dl className="space-y-1.5">
          <NameRow label="Below pass mark" names={names.belowPass} />
          <NameRow label="Absent" names={names.absent} />
          <NameRow label="Exempt" names={names.exempt} />
        </dl>
      ) : null}
    </section>
  );
}
