import { z } from "zod";

import type { TrackingDashboardResult } from "@/src/tracking/application/tracking-dashboard";

export const TRACKING_DASHBOARD_PATH = "/api/construction/tracking/dashboard";

/** Paise as a safe integer (rupees only on screen). */
const paise = z.int();
const count = z.int().nonnegative();

/** The Project Dashboard's tracking read (CM-805): a Project and a duration. */
export const GetConstructionTrackingDashboardRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "From must be on or before To.",
    path: ["from"],
  });

const taskStatusCounts = z.object({
  not_started: count,
  in_progress: count,
  delayed: count,
  completed: count,
});

const issueStatusCounts = z.object({
  pending: count,
  delayed: count,
  solved: count,
  closed: count,
});

export const GetConstructionTrackingDashboardResponseModel = z
  .object({
    /** Null without Task Read on the Project. */
    tasks: z
      .object({
        /**
         * Project Progress % (CM-0019 §4) over every live leaf task of the
         * Project, whatever the duration; null `pct` with no tasks.
         * `weighting` names the weight: Total Price when every leaf task
         * has one, else planned duration.
         */
        progress: z.object({
          pct: z.number().nullable(),
          weighting: z.enum(["price", "duration"]).nullable(),
        }),
        /** Tasks created in the duration the caller sees. */
        total: count,
        byStatus: taskStatusCounts,
        /**
         * Value Earned By Task: the top-most tasks of the duration with a
         * price, the ten largest by value (`more` counts the rest), and
         * the totals over all of them. Null without Task Financial.
         */
        valueEarned: z
          .object({
            tasks: z.array(
              z.object({
                id: z.uuid(),
                taskNo: z.int(),
                label: z.string(),
                name: z.string(),
                value: paise,
                earned: paise,
              }),
            ),
            more: count,
            totals: z.object({ value: paise, earned: paise }),
          })
          .nullable(),
        /** The most delayed leaf tasks, most days late first (at most 5). */
        mostDelayed: z.array(
          z.object({
            id: z.uuid(),
            taskNo: z.int(),
            label: z.string(),
            name: z.string(),
            dueDate: z.iso.date(),
            daysLate: count,
            progressPct: z.number(),
          }),
        ),
        /** False: only the tasks the caller created or is assigned to. */
        viewAll: z.boolean(),
      })
      .nullable(),
    /** Null without Issues & Snags Read on the Project. By Issue Date. */
    issues: z
      .object({
        total: count,
        byStatus: issueStatusCounts,
        byPriority: z.object({
          high: count,
          medium: count,
          low: count,
          none: count,
        }),
        /** Most issues first; a null id is "No category". */
        byCategory: z.array(
          z.object({
            categoryId: z.uuid().nullable(),
            name: z.string().nullable(),
            count,
          }),
        ),
        /** Assignee-wise by status, most issues first; a null id is "Not assigned". */
        byAssignee: z.array(
          issueStatusCounts.extend({
            memberId: z.uuid().nullable(),
            name: z.string().nullable(),
            total: count,
          }),
        ),
        /** False: only the issues the caller raised or is assigned to. */
        viewAll: z.boolean(),
      })
      .nullable(),
    /** Null without Inspection Request Read on the Project. By Inspection Date. */
    inspections: z
      .object({
        total: count,
        approved: count,
        pending: count,
        rejected: count,
        /** Approved ÷ (Approved + Rejected) × 100; null with no decided request. */
        successRate: z.number().nullable(),
      })
      .nullable(),
    /**
     * The KPI tiles, from `construction_reporting.project_pending_tracking`
     * (CM-902); a count is null without that menu's Read.
     */
    kpis: z.object({
      /** Open issues in the duration, delayed included. */
      pendingIssues: count.nullable(),
      /** Requests pending for approval in the duration. */
      pendingInspections: count.nullable(),
    }),
  })
  .meta({
    description:
      "The Project Dashboard's Task, Issue & Snag and Inspection Request sections and their KPI tiles (CM-805).",
  });
export type GetConstructionTrackingDashboardResponseModel = z.infer<
  typeof GetConstructionTrackingDashboardResponseModel
>;

function paiseNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("A task value is beyond a safe integer.");
  return number;
}

export function toTrackingDashboardResponse(
  result: TrackingDashboardResult,
  kpis: GetConstructionTrackingDashboardResponseModel["kpis"],
): GetConstructionTrackingDashboardResponseModel {
  const { tasks } = result;
  return {
    tasks:
      tasks == null
        ? null
        : {
            ...tasks,
            valueEarned:
              tasks.valueEarned == null
                ? null
                : {
                    tasks: tasks.valueEarned.tasks.map((task) => ({
                      ...task,
                      value: paiseNumber(task.value),
                      earned: paiseNumber(task.earned),
                    })),
                    more: tasks.valueEarned.more,
                    totals: {
                      value: paiseNumber(tasks.valueEarned.totals.value),
                      earned: paiseNumber(tasks.valueEarned.totals.earned),
                    },
                  },
          },
    issues: result.issues,
    inspections: result.inspections,
    kpis,
  };
}
