import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { dateLabel } from "./report-period";

/**
 * The Marketing reports (ADR CM-0040 §13). The source
 * (`src/composition/marketing-report-source.ts`) applies marketing's rules
 * — Missed, the own-entries scope, the month's bounds, the latest value —
 * and hands over rows in order with printable words; the builders only lay
 * them out.
 */

/** Whole rupees as the paise a money column holds. */
function paise(rupees: number | null): number | null {
  return rupees == null ? null : rupees * 100;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

const OWN_NOTE = {
  visits:
    "Only the Visits you created or went on (you do not have View all on Visits).",
  summary: "Only your own row (you do not have View all on Visits).",
  companies:
    "Only the Prospect Companies you created or are assigned (you do not have View all on Companies).",
} as const;

export type VisitRegisterRow = {
  number: string;
  /** "13 Nov 2026, 10:30" in the Company time zone. */
  when: string;
  company: string;
  city: string | null;
  /** The Contacts met, "Lakshmi, Ravi". */
  contacts: string | null;
  visitedBy: string;
  purpose: string | null;
  /** "Planned", "Missed", "Completed", "Cancelled". */
  status: string;
  /** The discussion, then the outcome. */
  discussion: string | null;
  interest: string | null;
  /** Whole rupees, when the Visit has one. */
  value: number | null;
  /** The earliest Open Follow-up made from the Visit. */
  nextFollowUp: CalendarDate | null;
  checkedIn: boolean;
};

export const VISIT_REGISTER_STATUSES = [
  "Planned",
  "Missed",
  "Completed",
  "Cancelled",
] as const;

/**
 * Visit register: one row per Visit of the period, newest first, with a
 * count by status under it.
 */
export function buildVisitRegister(input: {
  visits: readonly VisitRegisterRow[];
  own: boolean;
  /** The filters the job carries, as words ("Purpose: Quotation."). */
  filters: readonly string[];
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Visit No.", "text", 10),
    column("Date and time", "text", 17),
    column("Prospect Company", "text", 22),
    column("City", "text", 12),
    column("Contacts met", "text", 18),
    column("Visited by", "text", 18),
    column("Purpose", "text", 14),
    column("Status", "text", 10),
    column("Discussion / outcome", "text", 34),
    column("Interest", "text", 8),
    column("Approx. value", "money", 13),
    column("Next Follow-up", "text", 12),
    column("Checked in", "text", 8),
  ];
  const rows: Cell[][] = input.visits.map((visit) => [
    visit.number,
    visit.when,
    visit.company,
    visit.city,
    visit.contacts,
    visit.visitedBy,
    visit.purpose,
    visit.status,
    visit.discussion,
    visit.interest,
    paise(visit.value),
    visit.nextFollowUp == null ? null : dateLabel(visit.nextFollowUp),
    visit.checkedIn ? "Yes" : "No",
  ]);
  return {
    title: "Visit register",
    notes: [
      "Visits in the period, newest first, in the Company time zone. Missed is a Planned Visit whose time had passed without a check-in when the report was made. The approximate value is the one entered on the Visit.",
      ...(input.own ? [OWN_NOTE.visits] : []),
      ...input.filters,
    ],
    tables: [
      {
        name: "Visits",
        columns,
        rows,
        totals: columns.map((_, index) =>
          index === 0
            ? "Total"
            : index === 1
              ? plural(rows.length, "Visit", "Visits")
              : null,
        ),
      },
      {
        name: "By status",
        columns: [column("Status", "text", 18), column("Visits", "count", 8)],
        rows: VISIT_REGISTER_STATUSES.map((status) => [
          status,
          input.visits.filter((visit) => visit.status === status).length,
        ]),
        totals: ["Total", rows.length],
      },
    ],
  };
}

export type PersonSummaryRow = {
  name: string;
  /** False for someone no longer an active Marketing Person. */
  active: boolean;
  /** The month's visit target; null for none. */
  target: number | null;
  completed: number;
  missed: number;
  newCompanies: number;
  followUpsDone: number;
  followUpsOverdue: number;
  won: number;
};

/**
 * Marketing Person summary: one row per person for the month, with the
 * team's totals.
 */
export function buildPersonSummary(input: {
  people: readonly PersonSummaryRow[];
  own: boolean;
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Marketing Person", "text", 22),
    column("Active", "text", 7),
    column("Visit target", "count", 9),
    column("Visits completed", "count", 10),
    column("Visits missed", "count", 9),
    column("New Prospect Companies", "count", 12),
    column("Follow-ups done", "count", 10),
    column("Follow-ups overdue", "count", 10),
    column("Companies won", "count", 10),
  ];
  const rows: Cell[][] = input.people.map((person) => [
    person.name,
    person.active ? "Yes" : "No",
    person.target,
    person.completed,
    person.missed,
    person.newCompanies,
    person.followUpsDone,
    person.followUpsOverdue,
    person.won,
  ]);
  return {
    title: "Marketing Person summary",
    notes: [
      "Visits completed and missed are those the person went on in the month; Missed is a Planned Visit whose time passed without a check-in. New Prospect Companies are those assigned to the person and created in the month; companies won are those assigned to the person and moved to Won in the month.",
      "Follow-ups done are the person's Follow-ups marked Done in the month; overdue are their Follow-ups due in the month and still Open after the due date.",
      ...(input.own ? [OWN_NOTE.summary] : []),
    ],
    tables: [
      {
        name: "Marketing People",
        columns,
        rows,
        totals: totalsOf(columns, rows, { 0: "Total" }).map((cell, index) =>
          // A target is per person; the team's sum would mislead.
          index === 2 ? null : cell,
        ),
      },
    ],
  };
}

export type PipelineRow = {
  company: string;
  /** The Stage on the as-on day, "Quotation sent". */
  stage: string;
  assignedTo: string | null;
  city: string | null;
  lastVisit: CalendarDate | null;
  nextFollowUp: CalendarDate | null;
  /** Whole rupees, from the latest Visit that has a value. */
  value: number | null;
};

/**
 * Company pipeline: the Prospect Companies as on a day, in Stage order
 * then by name, with a count and value by Stage.
 */
export function buildCompanyPipeline(input: {
  companies: readonly PipelineRow[];
  /** Every Stage label, in the pipeline's order. */
  stages: readonly string[];
  own: boolean;
  filters: readonly string[];
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Prospect Company", "text", 26),
    column("Stage", "text", 16),
    column("Assigned to", "text", 18),
    column("City", "text", 14),
    column("Last Visit", "text", 12),
    column("Next Follow-up", "text", 12),
    column("Approx. value", "money", 14),
  ];
  const rows: Cell[][] = input.companies.map((company) => [
    company.company,
    company.stage,
    company.assignedTo,
    company.city,
    company.lastVisit == null ? null : dateLabel(company.lastVisit),
    company.nextFollowUp == null ? null : dateLabel(company.nextFollowUp),
    paise(company.value),
  ]);
  const byStage: Cell[][] = input.stages.map((stage) => {
    const inStage = input.companies.filter((row) => row.stage === stage);
    const values = inStage.flatMap((row) =>
      row.value == null ? [] : [row.value],
    );
    return [
      stage,
      inStage.length,
      values.length === 0
        ? null
        : paise(values.reduce((sum, value) => sum + value, 0)),
    ];
  });
  const stageColumns = [
    column("Stage", "text", 20),
    column("Companies", "count", 10),
    column("Approx. value", "money", 14),
  ];
  return {
    title: "Company pipeline",
    notes: [
      "Live Prospect Companies created by the day, with their Stage on that day. Last Visit is the latest Completed Visit up to the day; next Follow-up the earliest one Open on the day; the approximate value is the latest Visit's up to the day that has one. The assigned person is today's.",
      ...(input.own ? [OWN_NOTE.companies] : []),
      ...input.filters,
    ],
    tables: [
      {
        name: "Prospect Companies",
        columns,
        rows,
        totals: columns.map((col, index) =>
          index === 0
            ? "Total"
            : index === 1
              ? plural(rows.length, "company", "companies")
              : col.kind === "money"
                ? (totalsOf(columns, rows)[index] ?? null)
                : null,
        ),
      },
      {
        name: "By Stage",
        columns: stageColumns,
        rows: byStage,
        totals: totalsOf(stageColumns, byStage, { 0: "Total" }),
      },
    ],
  };
}
