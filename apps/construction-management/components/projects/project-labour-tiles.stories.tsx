import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { ProjectLabourSummary } from "@/src/queries/labour-summary";
import { addDays } from "@/src/shared-kernel/calendar-date";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI } from "./project-fixtures";
import { ProjectLabourTiles } from "./project-labour-tiles";

const SUMMARY_PATH = "/api/construction/labour/summary";

function summary(
  overrides: Partial<ProjectLabourSummary> = {},
): ProjectLabourSummary {
  return {
    date: "2026-10-09",
    labourers: {
      onProject: 24,
      present: 17,
      halfDay: 2,
      absent: 3,
      off: 0,
      unmarked: 2,
    },
    vendors: { assigned: 3, recordedToday: 2, headcountToday: 31 },
    presentSeries: Array.from({ length: 14 }, (_, index) => ({
      date: addDays("2026-09-26", index),
      present:
        [18, 20, 0, 19, 21, 22, 17, 20, 0, 18, 19, 21, 20, 19][index] ?? 0,
      vendorHeadcount: index % 7 === 2 ? 0 : 28 + (index % 4),
    })),
    labourBalance: { toPay: 1_84_50_000, advanced: 25_00_000 },
    vendorBalance: { toPay: 2_40_00_000, advanced: 0 },
    ...overrides,
  };
}

function serve(body: ProjectLabourSummary | null) {
  const api = mockApi((call) =>
    call.method === "GET" && call.path.startsWith(SUMMARY_PATH)
      ? body == null
        ? Response.json(
            { code: "PERMISSION_DENIED", message: "No access." },
            { status: 403 },
          )
        : Response.json(body)
      : undefined,
  );
  return api.restore;
}

const meta = {
  title: "Projects/LabourTiles",
  component: ProjectLabourTiles,
  args: { projectId: KUMARI.id },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-5xl p-6">
        <ProjectLabourTiles {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectLabourTiles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Today: Story = {
  beforeEach: () => serve(summary()),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Labour today" }),
    ).toBeVisible();
    await expect(canvas.getByText("19 of 24")).toBeVisible();
    await expect(canvas.getByText("2 not marked yet")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Vendor heads\s*31/ }),
    ).toBeVisible();
    await expect(canvas.getByText("₹1,84,500.00")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Labours present/ }),
    ).toHaveAttribute("href", `/app/projects/${KUMARI.id}/attendance/labour`);
    const table = within(
      canvas.getByRole("table", {
        name: "Labours present and vendor heads per day",
      }),
    );
    await expect(table.getAllByRole("row")).toHaveLength(15);
  },
};

export const WithoutFinancial: Story = {
  beforeEach: () =>
    serve(summary({ labourBalance: null, vendorBalance: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findAllByText("Needs the Financial permission"),
    ).toHaveLength(2);
  },
};

export const HiddenWithoutAttendance: Story = {
  beforeEach: () => serve(null),
  play: async ({ canvas }) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(
      canvas.queryByRole("heading", { name: "Labour today" }),
    ).toBeNull();
  },
};
