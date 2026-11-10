import type { TrackingDashboard } from "@/src/queries/tracking-dashboard";

/** Story data for the Project Dashboard's tracking sections (CM-805). */

export const TRACKING_DASHBOARD_PATH = "/api/construction/tracking/dashboard";

export const TOWER_TASK_ID = "0193a8f0-0000-7000-8000-00000000d001";
export const FOOTINGS_TASK_ID = "0193a8f0-0000-7000-8000-00000000d002";
export const QUALITY_ID = "0193a8f0-0000-7000-8000-00000000d101";
export const RAVI_ID = "0193a8f0-0000-7000-8000-00000000d201";

/** A Project with priced tasks, issues in every status and decided inspections. */
export function trackingDashboard(
  options: { financial?: boolean; viewAll?: boolean } = {},
): TrackingDashboard {
  const financial = options.financial ?? true;
  const viewAll = options.viewAll ?? true;
  return {
    tasks: {
      progress: { pct: 29.09, weighting: "price" },
      total: 12,
      byStatus: { not_started: 3, in_progress: 5, delayed: 2, completed: 2 },
      valueEarned: financial
        ? {
            tasks: [
              {
                id: TOWER_TASK_ID,
                taskNo: 1,
                label: "T-1",
                name: "Tower A structure",
                value: 10_00_000_00,
                earned: 3_00_000_00,
              },
              {
                id: FOOTINGS_TASK_ID,
                taskNo: 4,
                label: "T-4",
                name: "Footings and plinth beams",
                value: 1_00_000_00,
                earned: 20_000_00,
              },
            ],
            more: 1,
            totals: { value: 11_45_000_00, earned: 3_32_500_00 },
          }
        : null,
      mostDelayed: [
        {
          id: FOOTINGS_TASK_ID,
          taskNo: 4,
          label: "T-4",
          name: "Footings and plinth beams",
          dueDate: "2026-10-04",
          daysLate: 10,
          progressPct: 20,
        },
        {
          id: "0193a8f0-0000-7000-8000-00000000d003",
          taskNo: 7,
          label: "T-7",
          name: "Ground floor columns, grid A to F",
          dueDate: "2026-10-12",
          daysLate: 2,
          progressPct: 62.5,
        },
      ],
      viewAll,
    },
    issues: {
      total: 9,
      byStatus: { pending: 3, delayed: 2, solved: 1, closed: 3 },
      byPriority: { high: 2, medium: 3, low: 3, none: 1 },
      byCategory: [
        { categoryId: QUALITY_ID, name: "Quality", count: 5 },
        {
          categoryId: "0193a8f0-0000-7000-8000-00000000d102",
          name: "Safety",
          count: 3,
        },
        { categoryId: null, name: null, count: 1 },
      ],
      byAssignee: [
        {
          memberId: RAVI_ID,
          name: "Ravi Kumar",
          total: 5,
          pending: 2,
          delayed: 2,
          solved: 1,
          closed: 0,
        },
        {
          memberId: null,
          name: null,
          total: 4,
          pending: 1,
          delayed: 0,
          solved: 0,
          closed: 3,
        },
      ],
      viewAll,
    },
    inspections: {
      total: 6,
      approved: 3,
      pending: 2,
      rejected: 1,
      successRate: 75,
    },
    kpis: { pendingIssues: 5, pendingInspections: 2 },
  };
}

/** Nothing raised in the period, and a Project with no tasks. */
export function emptyTrackingDashboard(): TrackingDashboard {
  return {
    tasks: {
      progress: { pct: null, weighting: null },
      total: 0,
      byStatus: { not_started: 0, in_progress: 0, delayed: 0, completed: 0 },
      valueEarned: { tasks: [], more: 0, totals: { value: 0, earned: 0 } },
      mostDelayed: [],
      viewAll: true,
    },
    issues: {
      total: 0,
      byStatus: { pending: 0, delayed: 0, solved: 0, closed: 0 },
      byPriority: { high: 0, medium: 0, low: 0, none: 0 },
      byCategory: [],
      byAssignee: [],
      viewAll: true,
    },
    inspections: {
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
      successRate: null,
    },
    kpis: { pendingIssues: 0, pendingInspections: 0 },
  };
}

/** A member with the Dashboard but none of the tracking menus. */
export const NO_TRACKING: TrackingDashboard = {
  tasks: null,
  issues: null,
  inspections: null,
  kpis: { pendingIssues: null, pendingInspections: null },
};
