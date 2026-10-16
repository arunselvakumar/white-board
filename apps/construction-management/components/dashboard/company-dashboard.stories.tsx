import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { formatCalendarDate } from "@/components/projects/project-status";
import { browserToday, presetDuration } from "@/lib/dashboard-duration";
import type {
  CompanyDashboard as Dashboard,
  CompanyDashboardProject,
} from "@/src/queries/company-dashboard";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { CompanyDashboard } from "./company-dashboard";

const PATH = "/api/construction/reporting/company-dashboard";

const TOWER = "0b8f7a4e-2c1d-4f6a-9e3b-5d7c8a1f2e01";
const VILLA = "0b8f7a4e-2c1d-4f6a-9e3b-5d7c8a1f2e02";
const PLAZA = "0b8f7a4e-2c1d-4f6a-9e3b-5d7c8a1f2e03";

function project(
  overrides: Partial<CompanyDashboardProject> & { id: string; name: string },
): CompanyDashboardProject {
  return {
    status: "ongoing",
    progress: null,
    approvals: 0,
    pendingIssues: 0,
    delayedIssues: 0,
    pendingInspections: 0,
    labourToday: 0,
    due: 0,
    ...overrides,
  };
}

function dashboard(
  from: string,
  to: string,
  options: { financial?: boolean; projects?: CompanyDashboardProject[] } = {},
): Dashboard {
  const financial = options.financial ?? true;
  const projects = (
    options.projects ?? [
      project({
        id: TOWER,
        name: "Kumari Heights, Tower A",
        progress: { pct: 62.5, weighting: "price" },
        approvals: 7,
        pendingIssues: 5,
        delayedIssues: 2,
        pendingInspections: 1,
        labourToday: 38,
        due: 12_45_000_00,
      }),
      project({
        id: VILLA,
        name: "Anna Nagar Villas",
        progress: { pct: 18, weighting: "duration" },
        approvals: 3,
        pendingIssues: 1,
        pendingInspections: 2,
        labourToday: 14,
        due: 2_30_500_00,
      }),
      project({
        id: PLAZA,
        name: "OMR Plaza",
        status: "on_hold",
        approvals: 0,
        pendingIssues: 0,
        labourToday: 0,
        due: 0,
      }),
    ]
  ).map((row) => (financial ? row : { ...row, due: null }));
  const sum = (pick: (row: CompanyDashboardProject) => number | null) =>
    projects.reduce((total, row) => total + (pick(row) ?? 0), 0);
  return {
    today: to,
    from,
    to,
    financial,
    totals: {
      activeProjects: projects.filter((row) => row.status === "ongoing").length,
      approvals: sum((row) => row.approvals),
      pendingIssues: sum((row) => row.pendingIssues),
      pendingInspections: sum((row) => row.pendingInspections),
      labourToday: sum((row) => row.labourToday),
      amountDue: financial ? sum((row) => row.due) : null,
    },
    projects,
  };
}

let api: ReturnType<typeof mockApi>;

function serve(
  answer: (from: string, to: string) => Response | Promise<Response>,
) {
  return () => {
    api = mockApi(({ method, path }) => {
      if (method !== "GET" || !path.startsWith(PATH)) return undefined;
      const query = new URL(path, "http://storybook.local").searchParams;
      return answer(query.get("from") ?? "", query.get("to") ?? "") as Response;
    });
    return api.restore;
  };
}

function dashboardCalls(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call.path)
    .filter((path) => path.startsWith(PATH));
}

const meta = {
  title: "Dashboard/CompanyDashboard",
  component: CompanyDashboard,
  beforeEach: serve((from, to) => Response.json(dashboard(from, to))),
  render: () => (
    <StoryQueries>
      <CompanyDashboard />
    </StoryQueries>
  ),
} satisfies Meta<typeof CompanyDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Totals as tiles and every Project in a table, linking to its Dashboard. */
export const Desktop: Story = {
  play: async ({ canvas }) => {
    const totals = within(await canvas.findByRole("list", { name: "Totals" }));
    await expect(
      totals.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Active Projects2Ongoing, of 3 you can see",
      "Approvals waiting10Documents you may approve",
      "Pending Issues & Snags6Open, delayed included",
      "Pending Inspections3Waiting for a decision",
      `Labours present today52On ${formatCalendarDate(browserToday())}`,
      "Amount due₹14,75,500On bills from parties, today",
    ]);
    // The default duration is the last 12 months.
    const year = presetDuration("last_12_months", browserToday());
    await expect(dashboardCalls()[0]).toBe(
      `${PATH}?from=${year.from}&to=${year.to}`,
    );

    // The runner's viewport is a phone's; the table is in the page but
    // shown from 768 px.
    const table = within(canvas.getByRole("table", { hidden: true }));
    await expect(
      table
        .getAllByRole("columnheader", { hidden: true })
        .map((cell) => cell.textContent),
    ).toEqual([
      "Project",
      "Status",
      "Progress",
      "Approvals",
      "Pending issues",
      "Labour today",
      "Due",
    ]);
    await expect(
      table.getByRole("link", {
        name: "Kumari Heights, Tower A",
        hidden: true,
      }),
    ).toHaveAttribute("href", `/app/projects/${TOWER}/dashboard`);
    const rows = table.getAllByRole("row", { hidden: true });
    const tower = rows[1];
    if (tower == null) throw new Error("No row for Tower A");
    await expect(tower).toHaveTextContent("2 delayed");
    await expect(tower).toHaveTextContent("₹12,45,000");
    await expect(
      within(tower).getByRole("progressbar", {
        name: "Project Progress",
        hidden: true,
      }),
    ).toHaveAttribute("aria-valuenow", "62.5");
    await expect(rows[3]).toHaveTextContent("No tasks");
  },
};

/** A new duration refetches and keeps the figures on screen meanwhile. */
export const ChangeDuration: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Totals" });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Duration" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Last 30 days" }),
    );
    const month = presetDuration("last_30_days", browserToday());
    await waitFor(() =>
      expect(dashboardCalls().at(-1)).toBe(
        `${PATH}?from=${month.from}&to=${month.to}`,
      ),
    );
    await expect(canvas.getByRole("list", { name: "Totals" })).toBeVisible();
  },
};

export const Loading: Story = {
  beforeEach: serve(() => new Promise<Response>(() => undefined)),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByLabelText("Loading dashboard"),
    ).toHaveAttribute("aria-busy", "true");
    await expect(
      canvas.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "Totals" })).toBeNull();
  },
};

/** A member on no Project, or a Company with none yet. */
export const NoProjects: Story = {
  beforeEach: serve((from, to) =>
    Response.json(dashboard(from, to, { projects: [] })),
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Projects to show")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Projects" }),
    ).toHaveAttribute("href", "/app/projects");
    await expect(canvas.queryByRole("list", { name: "Totals" })).toBeNull();
  },
};

/**
 * Without Payments Read no amount shows anywhere; without Issues & Snags,
 * Inspection Request or Attendance Read their figures are "—" and say why.
 */
export const WithoutFinancial: Story = {
  beforeEach: serve((from, to) => {
    const view = dashboard(from, to, { financial: false });
    return Response.json({
      ...view,
      totals: {
        ...view.totals,
        approvals: null,
        pendingIssues: null,
        pendingInspections: null,
        labourToday: null,
      },
      projects: view.projects.map((row) => ({
        ...row,
        approvals: null,
        pendingIssues: null,
        delayedIssues: null,
        pendingInspections: null,
        labourToday: null,
      })),
    } satisfies Dashboard);
  }),
  play: async ({ canvas }) => {
    const totals = within(await canvas.findByRole("list", { name: "Totals" }));
    await expect(totals.getAllByRole("listitem")).toHaveLength(5);
    await expect(totals.queryByText("Amount due")).toBeNull();
    await expect(
      totals.getByText("Nothing here for you to approve"),
    ).toBeVisible();
    await expect(
      totals.getByText("Needs Issues & Snags read on a Project"),
    ).toBeVisible();
    await expect(
      totals.getByText("Needs Attendance read on a Project"),
    ).toBeVisible();
    // The table (shown from 768 px) has no Due column.
    const table = within(canvas.getByRole("table", { hidden: true }));
    await expect(
      table
        .getAllByRole("columnheader", { hidden: true })
        .map((cell) => cell.textContent),
    ).not.toContain("Due");
    const tower = table.getAllByRole("row", { hidden: true })[1];
    await expect(tower).not.toHaveTextContent("₹");
    await expect(tower).toHaveTextContent("—");
    // Nor do the cards at phone width.
    const cards = within(canvas.getByRole("list", { name: "Your Projects" }));
    await expect(cards.queryByText("Due")).toBeNull();
    await expect(cards.getAllByRole("link")[0]).not.toHaveTextContent("₹");
  },
};

/** Phones: totals as tiles, Projects as cards, nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Totals" });
    const cards = within(canvas.getByRole("list", { name: "Your Projects" }));
    const tower = cards.getByRole("link", { name: "Kumari Heights, Tower A" });
    await expect(tower).toBeVisible();
    await expect(tower).toHaveAttribute(
      "href",
      `/app/projects/${TOWER}/dashboard`,
    );
    await expect(tower).toHaveTextContent("₹12,45,000");
    await expect(cards.getAllByRole("link")).toHaveLength(3);
    // The table is for wider screens.
    await expect(canvas.queryByRole("table")).toBeNull();
    await expect(canvas.getByRole("table", { hidden: true })).not.toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
