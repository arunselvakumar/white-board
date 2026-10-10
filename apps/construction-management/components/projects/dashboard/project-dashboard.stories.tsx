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
import { ProjectDashboard } from "./project-dashboard";

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
): DashboardLayout {
  return {
    sections: sections.map(({ key, visible }) => {
      const section = DASHBOARD_SECTIONS.find((item) => item.key === key);
      return {
        key,
        label: section?.label ?? key,
        milestone: section?.milestone ?? null,
        visible,
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
  } = {},
) {
  return () => {
    let current = options.layout ?? layout();
    api = mockApi(({ method, path, body }) => {
      if (method === "GET" && path === LAYOUT_PATH)
        return Response.json(current);
      if (method === "POST" && path === `${LAYOUT_PATH}/update`) {
        const sent = (body as { sections: { key: string; visible: boolean }[] })
          .sections;
        current = layout(
          sent.length === 0
            ? undefined
            : [
                ...sent,
                ...DASHBOARD_SECTIONS.filter(
                  (section) => !sent.some((item) => item.key === section.key),
                ).map((section) => ({ key: section.key, visible: true })),
              ],
        );
        return Response.json(current);
      }
      if (method === "GET" && path === SUMMARY_PATH)
        return Response.json(options.summary ?? summary());
      if (method === "GET" && path.startsWith(PROCUREMENT_PATH))
        return Response.json(options.procurement ?? procurement());
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
    await expect(
      kpis.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual([
      "Material Approvals4Pending: 3 PR · 1 PO",
      "Payment Approvals—Arrives with M7",
      "Pending Issues & Snags—Arrives with M8",
      "Pending Inspections—Arrives with M8",
    ]);

    const projectSummary = within(
      canvas.getByRole("region", { name: "Project summary" }),
    );
    await expect(await projectSummary.findByText("₹4,20,00,000")).toBeVisible();
    await expect(projectSummary.getByText("64")).toBeVisible();
    await expect(projectSummary.getByText("Residential")).toBeVisible();
    await expect(projectSummary.queryByText("Locations")).toBeNull();

    const attendance = within(
      canvas.getByRole("region", { name: "Attendance" }),
    );
    await expect(await attendance.findByText("20 of 24")).toBeVisible();
    await expect(attendance.getByText("Labours present today")).toBeVisible();
    await expect(
      attendance.getByRole("figure", { name: "Labours present per day" }),
    ).toBeVisible();
    // The default duration is the last 12 months.
    const year = presetDuration("last_12_months", browserToday());
    await expect(labourCalls()[0]).toContain(`from=${year.from}`);

    // Materials has data (CM-510): summary, POs and the month-wise chart.
    const materials = within(canvas.getByRole("region", { name: "Materials" }));
    await expect(await materials.findByText("₹48,75,000.00")).toBeVisible();
    await expect(
      materials.getByText("Low stock").nextElementSibling,
    ).toHaveTextContent("4");
    await expect(
      materials.getByRole("figure", { name: "Purchase order value per month" }),
    ).toBeVisible();
    await expect(
      materials.getByRole("link", { name: "Stock Register" }),
    ).toBeVisible();
    // Every later section names the milestone that fills it.
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

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await within(
      await canvas.findByRole("region", { name: "Attendance" }),
    ).findByRole("figure");
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
