import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import { browserToday, presetDuration } from "@/lib/dashboard-duration";
import { DASHBOARD_SECTIONS } from "@/src/projects/domain/dashboard-sections";
import type { ProjectLabourSummary } from "@/src/queries/labour-summary";
import type { ProcurementDashboard } from "@/src/queries/procurement-dashboard";
import type {
  DashboardLayout,
  ProjectSummary,
} from "@/src/queries/project-dashboard";
import { addDays } from "@/src/shared-kernel/calendar-date";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { KUMARI } from "../project-fixtures";
import {
  emptyFinanceDashboard,
  FINANCE_DASHBOARD_PATH,
  financeDashboard,
  NO_PAYMENTS,
} from "./finance-dashboard-fixtures";
import { ProjectDashboard } from "./project-dashboard";
import {
  dailyWork,
  EMPTY_EQUIPMENT_USAGE,
  emptyDailyWork,
  equipmentUsage,
  SITE_WORK_DASHBOARD_PATH,
} from "./site-work-dashboard-fixtures";
import {
  emptyTrackingDashboard,
  FOOTINGS_TASK_ID,
  NO_TRACKING,
  TRACKING_DASHBOARD_PATH,
  trackingDashboard,
} from "./tracking-dashboard-fixtures";

const SUMMARY_PATH = `/api/construction/projects/projects/${KUMARI.id}/dashboard/summary`;
const LAYOUT_PATH = "/api/construction/projects/dashboard-layout";
const LABOUR_PATH = "/api/construction/labour/summary";
const PROCUREMENT_PATH = "/api/construction/procurement/dashboard";

function procurement(): ProcurementDashboard {
  return {
    materials: { total: 18, inStock: 12, lowStock: 4, outOfStock: 2 },
    purchaseOrders: {
      count: 7,
      value: 48_75_000_00,
      months: [
        { month: "2026-04", value: 12_40_000_00 },
        { month: "2026-05", value: 0 },
        { month: "2026-06", value: 21_85_000_00 },
        { month: "2026-07", value: 14_50_000_00 },
      ],
    },
    approvals: {
      purchaseRequests: 3,
      purchaseOrders: 1,
      transfers: null,
      total: 4,
    },
  };
}

function layout(
  sections: { key: string; visible: boolean }[] = DASHBOARD_SECTIONS.map(
    (section) => ({ key: section.key, visible: true }),
  ),
  /** Sections whose module is hidden on the Project (CM-902). */
  hiddenOnProject: readonly string[] = [],
): DashboardLayout {
  return {
    sections: sections.map(({ key, visible }) => {
      const section = DASHBOARD_SECTIONS.find((item) => item.key === key);
      return {
        key,
        label: section?.label ?? key,
        milestone: section?.milestone ?? null,
        visible,
        hiddenOnProject: hiddenOnProject.includes(key),
      };
    }),
  };
}

function summary(
  overrides: { financial?: boolean; structure?: "wings" | "locations" } = {},
): ProjectSummary {
  const financial = overrides.financial ?? true;
  return {
    project: {
      id: KUMARI.id,
      name: KUMARI.name,
      status: "ongoing",
      projectType:
        overrides.structure === "locations" ? "infrastructure" : "residential",
      structure: overrides.structure ?? "wings",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      budgetValue: financial ? 4_20_00_000_00 : null,
    },
    counts: {
      wings: overrides.structure === "locations" ? 0 : 2,
      floors: 18,
      units: 64,
      locations: overrides.structure === "locations" ? 5 : 0,
      drawings: 12,
      testingReports: 4,
      documents: 7,
    },
    financial,
  };
}

function labour(from: string, to: string): ProjectLabourSummary {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return {
    date: to,
    labourers: {
      onProject: 24,
      present: 18,
      halfDay: 2,
      absent: 3,
      off: 0,
      unmarked: 1,
    },
    vendors: { assigned: 2, recordedToday: 2, headcountToday: 11 },
    presentSeries: days.map((date, index) => ({
      date,
      present: index % 7 === 6 ? 0 : 14 + ((index * 5) % 9),
      vendorHeadcount: index % 7 === 6 ? 0 : 8,
    })),
    labourBalance: null,
    vendorBalance: null,
  };
}

let api: ReturnType<typeof mockApi>;

function serve(
  options: {
    layout?: DashboardLayout;
    summary?: ProjectSummary;
    labour?: "ok" | "forbidden";
    procurement?: ProcurementDashboard;
    /** The Daily Work and Equipment Usage sections (CM-608). */
    siteWork?: "data" | "empty" | "without_financial" | "forbidden";
    /** The Payments section and Payment Approvals (CM-709). */
    finance?: "data" | "empty" | "no_payments" | "forbidden";
    /** The Task, Issue & Snag and Inspection Request sections (CM-805). */
    tracking?:
      | "data"
      | "empty"
      | "without_financial"
      | "own_only"
      | "no_tracking"
      | "forbidden";
  } = {},
) {
  return () => {
    let current = options.layout ?? layout();
    api = mockApi(({ method, path, body }) => {
      if (
        method === "GET" &&
        (path === LAYOUT_PATH || path.startsWith(`${LAYOUT_PATH}?`))
      )
        return Response.json(current);
      if (method === "POST" && path === `${LAYOUT_PATH}/update`) {
        const sent = (body as { sections: { key: string; visible: boolean }[] })
          .sections;
        const saved = layout(
          sent.length === 0
            ? undefined
            : [
                ...sent,
                ...DASHBOARD_SECTIONS.filter(
                  (section) => !sent.some((item) => item.key === section.key),
                ).map((section) => ({ key: section.key, visible: true })),
              ],
        );
        // The update route answers without a Project: nothing is marked.
        current = layout(
          saved.sections,
          current.sections
            .filter((section) => section.hiddenOnProject)
            .map((section) => section.key),
        );
        return Response.json(saved);
      }
      if (method === "GET" && path === SUMMARY_PATH)
        return Response.json(options.summary ?? summary());
      if (method === "GET" && path.startsWith(PROCUREMENT_PATH))
        return Response.json(options.procurement ?? procurement());
      if (method === "GET" && path.startsWith(FINANCE_DASHBOARD_PATH)) {
        const finance = options.finance ?? "data";
        if (finance === "forbidden")
          return Response.json(
            { code: "PERMISSION_DENIED", message: "No." },
            { status: 403 },
          );
        if (finance === "no_payments") return Response.json(NO_PAYMENTS);
        const query = new URL(path, "http://storybook.local").searchParams;
        const from = query.get("from") ?? "";
        const to = query.get("to") ?? "";
        return Response.json(
          finance === "empty"
            ? emptyFinanceDashboard(from, to)
            : financeDashboard(from, to),
        );
      }
      if (method === "GET" && path.startsWith(TRACKING_DASHBOARD_PATH)) {
        const tracking = options.tracking ?? "data";
        if (tracking === "forbidden")
          return Response.json(
            { code: "PERMISSION_DENIED", message: "No." },
            { status: 403 },
          );
        if (tracking === "no_tracking") return Response.json(NO_TRACKING);
        if (tracking === "empty")
          return Response.json(emptyTrackingDashboard());
        return Response.json(
          trackingDashboard({
            financial: tracking !== "without_financial",
            viewAll: tracking !== "own_only",
          }),
        );
      }
      if (method === "GET" && path.startsWith(SITE_WORK_DASHBOARD_PATH)) {
        const siteWork = options.siteWork ?? "data";
        if (siteWork === "forbidden")
          return Response.json(
            { code: "PERMISSION_DENIED", message: "No." },
            { status: 403 },
          );
        const query = new URL(path, "http://storybook.local").searchParams;
        const from = query.get("from") ?? "";
        const to = query.get("to") ?? "";
        if (path.startsWith(`${SITE_WORK_DASHBOARD_PATH}/daily-work`))
          return Response.json(
            siteWork === "empty"
              ? emptyDailyWork(from, to)
              : dailyWork(from, to),
          );
        return Response.json(
          siteWork === "empty"
            ? EMPTY_EQUIPMENT_USAGE
            : equipmentUsage(siteWork === "data"),
        );
      }
      if (method === "GET" && path.startsWith(LABOUR_PATH)) {
        if (options.labour === "forbidden")
          return Response.json(
            { code: "PERMISSION_DENIED", message: "No." },
            { status: 403 },
          );
        const query = new URL(path, "http://storybook.local").searchParams;
        return Response.json(
          labour(query.get("from") ?? "", query.get("date") ?? ""),
        );
      }
      return undefined;
    });
    return api.restore;
  };
}

function labourCalls(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call.path)
    .filter((path) => path.startsWith(LABOUR_PATH));
}

const meta = {
  title: "Projects/Dashboard",
  component: ProjectDashboard,
  args: { projectId: KUMARI.id },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <ProjectDashboard {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFinancial: Story = {
  play: async ({ canvas }) => {
    const kpis = within(
      await canvas.findByRole("list", { name: "Key figures" }),
    );
    await kpis.findByText("Pending: 3 PR · 1 PO");
    await kpis.findByText(/^Pending: 2 transactions/);
    await expect(
      kpis.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Material Approvals4Pending: 3 PR · 1 PO",
      "Payment Approvals7Pending: 2 transactions · 1 transfer · 3 vouchers · 1 settlement",
      "Pending Issues & Snags5Open, delayed included",
      "Pending Inspections2Pending for approval",
    ]);

    const projectSummary = within(
      canvas.getByRole("region", { name: "Project summary" }),
    );
    await expect(
      (await projectSummary.findByText("Budget")).nextElementSibling,
    ).toHaveTextContent("₹4,20,00,000");
    await expect(projectSummary.getByText("64")).toBeVisible();
    await expect(projectSummary.getByText("Residential")).toBeVisible();
    await expect(projectSummary.queryByText("Locations")).toBeNull();

    const attendance = within(
      canvas.getByRole("region", { name: "Attendance" }),
    );
    await expect(
      (await attendance.findByText("Labours present today")).nextElementSibling,
    ).toHaveTextContent("20/24");
    await expect(
      attendance.getByRole("figure", { name: "Labours present per day" }),
    ).toBeVisible();
    // The default duration is the last 12 months.
    const year = presetDuration("last_12_months", browserToday());
    await expect(labourCalls()[0]).toContain(`from=${year.from}`);

    // Materials has data (CM-510): summary, POs and the month-wise chart.
    const materials = within(canvas.getByRole("region", { name: "Materials" }));
    await expect(
      (await materials.findByText("Purchase order value")).nextElementSibling,
    ).toHaveTextContent("₹48,75,000");
    await expect(
      materials.getByText("Low stock").nextElementSibling,
    ).toHaveTextContent("4");
    await expect(
      materials.getByRole("figure", { name: "Purchase order value per month" }),
    ).toBeVisible();
    await expect(
      materials.getByRole("link", { name: "Stock Register" }),
    ).toBeVisible();
    // Booking and Inquiry name the milestone that fills them.
    await expect(
      within(canvas.getByRole("region", { name: "Booking" })).getByText(
        "Arrives with Sales (M10)",
      ),
    ).toBeVisible();
    const regions = canvas
      .getAllByRole("region")
      .map((region) => region.querySelector("h2")?.textContent);
    await expect(regions).toEqual(
      DASHBOARD_SECTIONS.map((section) => section.label),
    );
  },
};

/**
 * Payments (CM-709): money in and out by month with the balance, Due
 * Payments and Module Wise Payment.
 */
export const PaymentsSection: Story = {
  play: async ({ canvas }) => {
    const payments = within(
      await canvas.findByRole("region", { name: "Payments" }),
    );
    await expect(
      await payments.findByRole("figure", {
        name: "Payment in and out per month",
      }),
    ).toBeVisible();
    await expect(
      payments.getByRole("slider", { name: "Month" }),
    ).toHaveAttribute("aria-valuetext", expect.stringMatching(/, in ₹/));
    const dues = within(payments.getByRole("table", { name: "Due payments" }));
    await expect(
      dues.getByRole("rowheader", { name: /Velan Constructions/ }),
    ).toBeVisible();
    await expect(dues.getByText("₹7,40,000.00")).toBeVisible();
    await expect(dues.getByText("₹2,15,000.00")).toBeVisible();
    const modules = within(
      payments.getByRole("figure", { name: "Module wise payment" }),
    );
    await expect(modules.getAllByRole("listitem")).toHaveLength(6);
    await expect(modules.getByText("₹14,00,000.00")).toBeVisible();
    await expect(
      payments.getByRole("link", { name: "Payments" }),
    ).toHaveAttribute("href", `/app/projects/${KUMARI.id}/payments`);
    // The month table for screen readers sits in a hidden wrapper.
    const table = payments.getByRole("table", {
      name: "Payment in and out per month",
    });
    await expect(table.parentElement).toHaveClass("sr-only");
    await expect(table).not.toHaveClass("sr-only");
  },
};

/** No money on the Project in the period. */
export const PaymentsEmpty: Story = {
  beforeEach: serve({ finance: "empty" }),
  play: async ({ canvas }) => {
    const payments = within(
      await canvas.findByRole("region", { name: "Payments" }),
    );
    await expect(
      await payments.findByText("Nothing is due to any party on this Project."),
    ).toBeVisible();
    await expect(
      payments.getByText(
        "Nothing was paid out on this Project in this period.",
      ),
    ).toBeVisible();
    const kpis = within(canvas.getByRole("list", { name: "Key figures" }));
    await expect(
      await kpis.findByText(
        "Pending: 0 transactions · 0 transfers · 0 vouchers · 0 expenses · 0 settlements",
      ),
    ).toBeVisible();
  },
};

/** Without Payments Read the section says so; nothing to approve. */
export const PaymentsNeedPermission: Story = {
  beforeEach: serve({ finance: "no_payments" }),
  play: async ({ canvas }) => {
    const payments = within(
      await canvas.findByRole("region", { name: "Payments" }),
    );
    await expect(
      await payments.findByText(
        "Payments need the Payments permission on this Project.",
      ),
    ).toBeVisible();
    const kpis = within(canvas.getByRole("list", { name: "Key figures" }));
    await expect(
      await kpis.findAllByText("Nothing here for you to approve"),
    ).not.toHaveLength(0);
  },
};

/** Without the Dashboard permission the section names it. */
export const PaymentsRefused: Story = {
  beforeEach: serve({ finance: "forbidden" }),
  play: async ({ canvas }) => {
    const payments = within(
      await canvas.findByRole("region", { name: "Payments" }),
    );
    await expect(
      await payments.findByText(
        "Payments need the Dashboard permission on this Project.",
      ),
    ).toBeVisible();
  },
};

/**
 * Task, Issue & Snag and Inspection Request with data and Financial
 * (CM-805): the gauges, the bars and the most delayed tasks.
 */
export const TrackingSections: Story = {
  play: async ({ canvas }) => {
    const task = within(await canvas.findByRole("region", { name: "Task" }));
    const progress = await task.findByRole("meter", {
      name: "Project Progress",
    });
    await expect(progress).toHaveAttribute("aria-valuetext", "29.09%");
    await expect(task.getByText("Weighted by Total Price")).toBeVisible();
    await expect(
      task.getByText("Every task of the Project, whatever the period."),
    ).toBeVisible();
    const statuses = within(
      task.getByRole("figure", { name: "Tasks by status" }),
    );
    await expect(statuses.getAllByRole("listitem")).toHaveLength(4);
    await expect(statuses.getByText("Delayed")).toBeVisible();
    const value = within(
      task.getByRole("figure", { name: "Value earned by task" }),
    );
    await expect(value.getByText("Tower A structure")).toBeVisible();
    await expect(value.getByText("₹3,00,000.00")).toBeVisible();
    await expect(
      value.getByText("And 1 more task, counted in the totals."),
    ).toBeVisible();
    await expect(
      task.getByText("Total earned value").nextElementSibling,
    ).toHaveTextContent("₹3,32,500");
    const delayed = within(
      task.getByRole("list", { name: "Most delayed tasks" }),
    );
    await expect(delayed.getByText("10 days late")).toBeVisible();
    await expect(
      delayed.getByRole("link", { name: /Footings and plinth beams/ }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${KUMARI.id}/tasks/${FOOTINGS_TASK_ID}`,
    );

    const issues = within(canvas.getByRole("region", { name: "Issue & Snag" }));
    const priority = within(
      issues.getByRole("figure", { name: "Issues by priority" }),
    );
    await expect(priority.getByText("High")).toBeVisible();
    await expect(priority.getByText("No priority")).toBeVisible();
    const categories = within(
      issues.getByRole("figure", { name: "Issues by category" }),
    );
    await expect(categories.getByText("Quality")).toBeVisible();
    await expect(categories.getByText("No category")).toBeVisible();
    const assignees = within(
      issues.getByRole("figure", { name: "Issues by assignee" }),
    );
    await expect(assignees.getByText("Ravi Kumar")).toBeVisible();
    await expect(
      assignees.getByText("2 pending · 2 delayed · 1 solved"),
    ).toBeVisible();
    await expect(assignees.getByText("Not assigned")).toBeVisible();

    const inspections = within(
      canvas.getByRole("region", { name: "Inspection Request" }),
    );
    await expect(
      inspections.getByRole("meter", { name: "Success Rate" }),
    ).toHaveAttribute("aria-valuetext", "75%");
    await expect(
      inspections.getByText("Rejected").nextElementSibling,
    ).toHaveTextContent("1");
  },
};

/** Nothing in the period and no tasks: "—" gauges and empty states. */
export const TrackingEmpty: Story = {
  beforeEach: serve({ tracking: "empty" }),
  play: async ({ canvas }) => {
    const task = within(await canvas.findByRole("region", { name: "Task" }));
    await expect(
      await task.findByRole("img", {
        name: "Project Progress: no figure yet",
      }),
    ).toBeVisible();
    await expect(task.getByText("No tasks yet")).toBeVisible();
    await expect(
      task.getByText("No task was added in this period."),
    ).toBeVisible();
    await expect(
      task.getByText("No priced task was added in this period."),
    ).toBeVisible();
    await expect(task.getByText("No task is past its Due Date.")).toBeVisible();
    const issues = within(canvas.getByRole("region", { name: "Issue & Snag" }));
    await expect(
      issues.getAllByText("No issue was raised in this period."),
    ).toHaveLength(4);
    const inspections = within(
      canvas.getByRole("region", { name: "Inspection Request" }),
    );
    await expect(
      inspections.getByText(
        "No request was approved or rejected in this period.",
      ),
    ).toBeVisible();
    const kpis = within(canvas.getByRole("list", { name: "Key figures" }));
    await expect(kpis.getByText("Open, delayed included")).toBeVisible();
  },
};

/** Without Task Financial there is no Value Earned By Task. */
export const TrackingWithoutFinancial: Story = {
  beforeEach: serve({ tracking: "without_financial" }),
  play: async ({ canvas }) => {
    const task = within(await canvas.findByRole("region", { name: "Task" }));
    await task.findByRole("meter", { name: "Project Progress" });
    await expect(
      task.queryByRole("figure", { name: "Value earned by task" }),
    ).toBeNull();
    await expect(task.queryByText("Total earned value")).toBeNull();
  },
};

/** Without View all the sections say they count the member's own. */
export const TrackingOwnOnly: Story = {
  beforeEach: serve({ tracking: "own_only" }),
  play: async ({ canvas }) => {
    const task = within(await canvas.findByRole("region", { name: "Task" }));
    await expect(
      await task.findByText(/that you created or are assigned to/),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("region", { name: "Issue & Snag" })).getByText(
        /Only the issues you raised or are assigned to/,
      ),
    ).toBeVisible();
  },
};

/** Without the tracking menus each section names what it needs. */
export const TrackingNeedsPermission: Story = {
  beforeEach: serve({ tracking: "no_tracking" }),
  play: async ({ canvas }) => {
    const task = within(await canvas.findByRole("region", { name: "Task" }));
    await expect(
      await task.findByText("Tasks need the Task permission on this Project."),
    ).toBeVisible();
    await expect(
      within(
        canvas.getByRole("region", { name: "Inspection Request" }),
      ).getByText(
        "Inspection Requests need the Inspection Request permission on this Project.",
      ),
    ).toBeVisible();
    const kpis = within(canvas.getByRole("list", { name: "Key figures" }));
    await expect(
      await kpis.findByText("Needs Issues & Snags read"),
    ).toBeVisible();
    await expect(kpis.getByText("Needs Inspection Request read")).toBeVisible();
  },
};

/** Without the Dashboard permission the sections say so. */
export const TrackingRefused: Story = {
  beforeEach: serve({ tracking: "forbidden" }),
  play: async ({ canvas }) => {
    const issues = within(
      await canvas.findByRole("region", { name: "Issue & Snag" }),
    );
    await expect(
      await issues.findByText(
        "Issues & Snags need the Dashboard permission on this Project.",
      ),
    ).toBeVisible();
  },
};

/** Daily Work and Equipment Usage with data and Financial (CM-608). */
export const SiteWorkSections: Story = {
  play: async ({ canvas }) => {
    const daily = within(
      await canvas.findByRole("region", { name: "Daily Work" }),
    );
    await expect(await daily.findByText("214")).toBeVisible();
    await expect(daily.getByText("Pending approval")).toBeVisible();
    await expect(
      daily.getByRole("figure", { name: "Labour availability per day" }),
    ).toBeVisible();
    const legend = within(daily.getByRole("list", { name: "Legend" }));
    await expect(legend.getByText("On worksheets")).toBeVisible();
    await expect(legend.getByText("In attendance")).toBeVisible();
    const contractors = within(
      daily.getByRole("table", { name: "Contractor-wise labour" }),
    );
    await expect(
      contractors.getByRole("rowheader", { name: /Velan Constructions/ }),
    ).toBeVisible();
    await expect(contractors.getByText("1067")).toBeVisible();
    await expect(contractors.getByText("A removed Contractor")).toBeVisible();
    await expect(
      daily.getByRole("link", { name: "Worksheets" }),
    ).toHaveAttribute("href", `/app/projects/${KUMARI.id}/worksheets`);

    const equipment = within(
      canvas.getByRole("region", { name: "Equipment Usage" }),
    );
    await expect(await equipment.findByText("612.5 hrs")).toBeVisible();
    await expect(
      equipment.getByText("Distance").nextElementSibling,
    ).toHaveTextContent("1,840.25 km");
    await expect(
      equipment.getByText("Hire cost (rented)").nextElementSibling,
    ).toHaveTextContent("₹7,42,500");
    const top = within(
      equipment.getByRole("figure", { name: "Top equipment by work hours" }),
    );
    await expect(top.getAllByRole("listitem")).toHaveLength(4);
    await expect(top.getByText("214.5 hrs")).toBeVisible();
    const split = within(
      equipment.getByRole("figure", { name: "Owned vs rented hours" }),
    );
    await expect(split.getByText("354.5 hrs")).toBeVisible();
    await expect(split.getByText("258 hrs")).toBeVisible();
  },
};

/** No worksheets or usage sheets in the period. */
export const SiteWorkEmpty: Story = {
  beforeEach: serve({ siteWork: "empty" }),
  play: async ({ canvas }) => {
    const daily = within(
      await canvas.findByRole("region", { name: "Daily Work" }),
    );
    await expect(
      await daily.findByText("No worksheets in this period."),
    ).toBeVisible();
    const equipment = within(
      canvas.getByRole("region", { name: "Equipment Usage" }),
    );
    await expect(
      await equipment.findAllByText(
        "No hourly equipment worked in this period.",
      ),
    ).toHaveLength(2);
  },
};

/** Without Financial on Equipment Usage the hire cost is not shown. */
export const SiteWorkWithoutFinancial: Story = {
  beforeEach: serve({ siteWork: "without_financial" }),
  play: async ({ canvas }) => {
    const equipment = within(
      await canvas.findByRole("region", { name: "Equipment Usage" }),
    );
    await expect(await equipment.findByText("612.5 hrs")).toBeVisible();
    await expect(equipment.queryByText("Hire cost (rented)")).toBeNull();
  },
};

/** Without the Dashboard permission the sections say what is needed. */
export const SiteWorkNeedsPermission: Story = {
  beforeEach: serve({ siteWork: "forbidden" }),
  play: async ({ canvas }) => {
    const daily = within(
      await canvas.findByRole("region", { name: "Daily Work" }),
    );
    await expect(
      await daily.findByText(
        "Daily Work needs the Dashboard permission on this Project.",
      ),
    ).toBeVisible();
  },
};

export const WithoutFinancial: Story = {
  beforeEach: serve({ summary: summary({ financial: false }) }),
  play: async ({ canvas }) => {
    const projectSummary = within(
      await canvas.findByRole("region", { name: "Project summary" }),
    );
    await expect(await projectSummary.findByText("Drawings")).toBeVisible();
    await expect(projectSummary.queryByText("Budget")).toBeNull();
  },
};

export const LocationsProject: Story = {
  beforeEach: serve({ summary: summary({ structure: "locations" }) }),
  play: async ({ canvas }) => {
    const projectSummary = within(
      await canvas.findByRole("region", { name: "Project summary" }),
    );
    await expect(await projectSummary.findByText("Locations")).toBeVisible();
    await expect(projectSummary.queryByText("Wings")).toBeNull();
    await expect(projectSummary.getByText("Infrastructure")).toBeVisible();
  },
};

export const AttendanceNeedsPermission: Story = {
  beforeEach: serve({ labour: "forbidden" }),
  play: async ({ canvas }) => {
    const attendance = within(
      await canvas.findByRole("region", { name: "Attendance" }),
    );
    await expect(
      await attendance.findByText(
        "Attendance needs the Attendance permission on this Project.",
      ),
    ).toBeVisible();
  },
};

export const DurationPresetsAndCustom: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("region", { name: "Attendance" });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Duration" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Last 30 days" }),
    );
    const month = presetDuration("last_30_days", browserToday());
    await waitFor(() =>
      expect(labourCalls().at(-1)).toContain(`from=${month.from}`),
    );
    await expect(
      await within(
        canvas.getByRole("region", { name: "Attendance" }),
      ).findByRole("figure"),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("combobox", { name: "Duration" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Custom range" }),
    );
    // Date fields take a whole value at once.
    await fireEvent.change(canvas.getByLabelText("From"), {
      target: { value: addDays(browserToday(), 2) },
    });
    await expect(
      await canvas.findByText("Choose a start date on or before the end date."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Attendance" }),
    ).toBeNull();
  },
};

export const ManageDashboard: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("region", { name: "Project summary" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Manage dashboard" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Booking" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Inquiry" }));
    dialog.getByRole("button", { name: "Move Attendance up" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(
      dialog.getByRole("button", { name: "Move Attendance down" }),
    ).toHaveFocus();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());

    const saved = api.calls.mock.calls.find(
      ([call]) => call.method === "POST",
    )?.[0].body as { sections: { key: string; visible: boolean }[] };
    await expect(saved.sections.slice(0, 2)).toEqual([
      { key: "attendance", visible: true },
      { key: "summary", visible: true },
    ]);
    await expect(
      saved.sections.filter((section) => !section.visible).map((s) => s.key),
    ).toEqual(["booking", "inquiry"]);
    await waitFor(() =>
      expect(canvas.queryByRole("region", { name: "Booking" })).toBeNull(),
    );
    await expect(
      canvas.getAllByRole("region")[0]?.querySelector("h2"),
    ).toHaveTextContent("Attendance");
  },
};

export const ManageDashboardReset: Story = {
  beforeEach: serve({
    layout: layout([
      { key: "task", visible: false },
      { key: "summary", visible: true },
    ]),
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("region", { name: "Project summary" });
    await expect(canvas.queryByRole("region", { name: "Task" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Manage dashboard" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Reset to default" }),
    );
    await expect(dialog.getByRole("checkbox", { name: "Task" })).toBeChecked();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        api.calls.mock.calls.find(([call]) => call.method === "POST")?.[0].body,
      ).toEqual({ sections: [] }),
    );
    await expect(
      await canvas.findByRole("region", { name: "Task" }),
    ).toBeVisible();
  },
};

export const EverySectionHidden: Story = {
  beforeEach: serve({
    layout: layout(
      DASHBOARD_SECTIONS.map((section) => ({
        key: section.key,
        visible: false,
      })),
    ),
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Every section is hidden. Use Manage dashboard to show some.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("list", { name: "Key figures" }),
    ).toBeVisible();
  },
};

/**
 * Issues & Snags is hidden on this Project (Hide / Show Modules, CM-902):
 * its section is left out, and Manage Dashboard shows it disabled with
 * the reason. Saving keeps the member's tick for other Projects.
 */
export const ModuleHiddenOnProject: Story = {
  beforeEach: serve({
    layout: layout(undefined, ["issue_snag"]),
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("region", { name: "Inspection Request" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "Issue & Snag" }),
    ).toBeNull();
    await expect(
      api.calls.mock.calls.some(
        ([call]) =>
          call.path ===
          `${LAYOUT_PATH}?projectId=${encodeURIComponent(KUMARI.id)}`,
      ),
    ).toBe(true);

    await userEvent.click(
      canvas.getByRole("button", { name: "Manage dashboard" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    const issues = dialog.getByRole("checkbox", { name: "Issue & Snag" });
    await expect(issues).toHaveAttribute("aria-disabled", "true");
    await expect(issues).not.toBeChecked();
    await expect(issues).toHaveAccessibleDescription("Hidden on this Project");
    await expect(
      dialog.getByRole("checkbox", { name: "Task" }),
    ).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    const saved = api.calls.mock.calls.find(
      ([call]) => call.method === "POST",
    )?.[0].body as { sections: { key: string; visible: boolean }[] };
    await expect(
      saved.sections.find((section) => section.key === "issue_snag"),
    ).toEqual({ key: "issue_snag", visible: true });
    await expect(
      canvas.queryByRole("region", { name: "Issue & Snag" }),
    ).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await within(
      await canvas.findByRole("region", { name: "Attendance" }),
    ).findByRole("figure");
    await within(canvas.getByRole("region", { name: "Daily Work" })).findByRole(
      "table",
      { name: "Contractor-wise labour" },
    );
    await within(
      canvas.getByRole("region", { name: "Equipment Usage" }),
    ).findByRole("figure", { name: "Top equipment by work hours" });
    await within(canvas.getByRole("region", { name: "Payments" })).findByRole(
      "table",
      { name: "Due payments" },
    );
    await within(canvas.getByRole("region", { name: "Task" })).findByRole(
      "figure",
      { name: "Value earned by task" },
    );
    await within(
      canvas.getByRole("region", { name: "Issue & Snag" }),
    ).findByRole("figure", { name: "Issues by assignee" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
