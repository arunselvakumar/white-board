import { z } from "zod";

import type { DashboardReadModel } from "@/src/marketing/application/dashboard-handlers";
import {
  DASHBOARD_MAX_DAYS,
  DASHBOARD_PERIODS,
} from "@/src/marketing/domain/dashboard";
import {
  FOLLOW_UP_TYPES,
  STAGES,
} from "@/src/marketing/domain/marketing-terms";

export const DASHBOARD_PATH = "/api/construction/marketing/dashboard";

export const GetConstructionMarketingDashboardRequestModel = z.object({
  period: z
    .enum(DASHBOARD_PERIODS)
    .default("this_month")
    .describe("Weeks start on Monday, in the Company time zone."),
  from: z.iso
    .date()
    .optional()
    .describe(
      `First day of a custom period; with \`to\`, at most ${String(DASHBOARD_MAX_DAYS)} days (400 \`DASHBOARD_PERIOD_INVALID\`).`,
    ),
  to: z.iso.date().optional().describe("Last day of a custom period."),
  memberId: z
    .uuid()
    .optional()
    .describe(
      "One Marketing Person's figures: needs View all on the Dashboard (400 `DASHBOARD_PERSON_NOT_ALLOWED`); a Marketing Person of this Company, active or not (400 `MARKETING_PERSON_NOT_FOUND`).",
    ),
});

const count = z.int().nonnegative();
const Ref = z.object({ id: z.uuid(), name: z.string() });
/** A User: who did it. */
const UserRef = z.object({ id: z.string(), name: z.string() });

export const GetConstructionMarketingDashboardResponseModel = z.object({
  period: z.object({
    kind: z.enum(DASHBOARD_PERIODS),
    from: z.iso.date(),
    to: z.iso.date().describe("Inclusive."),
  }),
  scope: z
    .enum(["own", "team", "person"])
    .describe(
      "Whose records: the caller's own (ADR CM-0040 §5), the team's, or one Marketing Person's.",
    ),
  canViewTeam: z.boolean().describe("View all on the Dashboard."),
  people: z
    .array(z.object({ id: z.uuid(), name: z.string(), active: z.boolean() }))
    .nullable()
    .describe(
      "Marketing People to filter by, inactive ones included; null without View all.",
    ),
  totals: z.object({
    visitsCompleted: count.nullable(),
    visitsPlanned: count
      .nullable()
      .describe("Planned in the period and not Missed."),
    visitsMissed: count.nullable(),
    followUpsDueToday: count
      .nullable()
      .describe("Open, due on the Company's today, whatever the period."),
    followUpsOverdue: count
      .nullable()
      .describe("Open, due before today, whatever the period."),
    newCompanies: count.nullable(),
    companiesWon: count
      .nullable()
      .describe("Companies moved to Won in the period."),
  }),
  today: z
    .object({
      visits: z
        .array(
          z.object({
            id: z.uuid(),
            number: z.string(),
            visitAt: z.iso.datetime(),
            status: z.enum(["planned", "missed", "completed"]),
            checkedIn: z.boolean(),
            company: Ref,
          }),
        )
        .nullable()
        .describe(
          "The caller's Visits dated today, not cancelled; null without Visits read.",
        ),
      followUps: z
        .array(
          z.object({
            id: z.uuid(),
            type: z.enum(FOLLOW_UP_TYPES),
            dueDate: z.iso.date(),
            company: Ref,
          }),
        )
        .nullable()
        .describe(
          "Open Follow-ups the caller owns, due today; null without Follow-ups read.",
        ),
    })
    .describe("Always the caller's own, whatever the scope."),
  perPerson: z
    .array(
      z.object({
        memberId: z.uuid(),
        name: z.string(),
        active: z.boolean(),
        completed: count,
        target: count
          .nullable()
          .describe(
            "The month's Visit target, for this month or last month only.",
          ),
      }),
    )
    .nullable()
    .describe(
      "Every Marketing Person's completed Visits in the period; null without View all or Visits read.",
    ),
  stages: z
    .object({
      counts: z
        .array(z.object({ stage: z.enum(STAGES), count }))
        .describe("Every Stage, in Stage order, zeros kept."),
      wonInPeriod: count,
      lostInPeriod: count,
    })
    .nullable()
    .describe("Null without Companies read."),
  overTime: z
    .object({
      bucket: z
        .enum(["day", "week"])
        .describe(
          "Day for this week or a custom period of up to 14 days; a week starts on Monday.",
        ),
      points: z.array(
        z.object({ start: z.iso.date(), completed: count, missed: count }),
      ),
    })
    .nullable()
    .describe("Null without Visits read."),
  recent: z
    .array(
      z.object({
        kind: z.enum([
          "visit_completed",
          "note",
          "stage_change",
          "follow_up_done",
        ]),
        at: z.iso.datetime(),
        by: UserRef.nullable(),
        company: Ref,
        visit: z.object({ id: z.uuid(), number: z.string() }).nullable(),
        text: z.string(),
      }),
    )
    .nullable()
    .describe(
      "The latest 10, newest first, whatever the period; a kind the caller cannot read is left out; null when none can be read.",
    ),
  hotWithoutFollowUp: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        lastVisitAt: z.iso.datetime(),
        assignedTo: Ref.nullable(),
      }),
    )
    .nullable()
    .describe(
      "Companies Hot at their latest Completed Visit with no open Follow-up, newest Visit first, at most 10; null without Companies, Visits and Follow-ups read.",
    ),
});

export type GetConstructionMarketingDashboardResponse = z.infer<
  typeof GetConstructionMarketingDashboardResponseModel
>;

export function toDashboardResponse(
  model: DashboardReadModel,
): GetConstructionMarketingDashboardResponse {
  return {
    ...model,
    today: {
      visits:
        model.today.visits?.map((visit) => ({
          ...visit,
          visitAt: visit.visitAt.toISOString(),
        })) ?? null,
      followUps: model.today.followUps,
    },
    recent:
      model.recent?.map((row) => ({ ...row, at: row.at.toISOString() })) ??
      null,
    hotWithoutFollowUp:
      model.hotWithoutFollowUp?.map((row) => ({
        ...row,
        lastVisitAt: row.lastVisitAt.toISOString(),
      })) ?? null,
  };
}
