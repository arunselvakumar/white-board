import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { OCTOBER } from "./attendance-fixtures";
import { MonthlyAttendancePage } from "./monthly-attendance-page";

const SUMMARY = "/api/construction/hrms/attendance/monthly-summary";

let calls: ApiCall[] = [];

function serve(empty = false) {
  return () => {
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method !== "GET" || !call.path.startsWith(SUMMARY))
        return undefined;
      const month = new URL(call.path, "http://x").searchParams.get("month");
      return Response.json(
        empty || month !== "2026-10"
          ? { ...OCTOBER, month: month ?? "", rows: [] }
          : OCTOBER,
      );
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Attendance/Monthly",
  component: MonthlyAttendancePage,
  args: { initialMonth: "2026-10" },
  render: (args) => (
    <StoryQueries>
      <MonthlyAttendancePage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MonthlyAttendancePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MemberByDayGrid: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    const table = within(
      await canvas.findByRole("table", { name: "Attendance by day" }),
    );
    const prabhu = within(table.getByRole("row", { name: "Prabhu Saravanan" }));
    await expect(
      prabhu.getByLabelText("Prabhu Saravanan 2026-10-01 Holiday"),
    ).toHaveTextContent("H");
    await expect(
      prabhu.getByLabelText("Prabhu Saravanan 2026-10-07 Half Day"),
    ).toHaveTextContent("HD");
    await expect(
      prabhu.getByLabelText("Prabhu Saravanan 2026-10-08 On Leave"),
    ).toHaveTextContent("½L");
    // Days after today are blank.
    await expect(
      prabhu.queryByLabelText(/Prabhu Saravanan 2026-10-11/),
    ).toBeNull();
    const cells = prabhu.getAllByRole("cell").map((cell) => cell.textContent);
    // P, HD, A, L, H, WO, Late, Hours, OT h.
    await expect(cells.slice(-9)).toEqual([
      "4.5",
      "1",
      "1",
      "0.5",
      "1",
      "2",
      "1",
      "38.5",
      "2",
    ]);
    await expect(
      canvas.getByRole("link", { name: "Download Excel" }),
    ).toHaveAttribute(
      "href",
      "/api/construction/hrms/attendance/report/monthly?month=2026-10",
    );
  },
};

export const ChangesTheMonth: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    await canvas.findByRole("table", { name: "Attendance by day" });
    await fireEvent.change(canvas.getByLabelText("Month"), {
      target: { value: "2026-09" },
    });
    await expect(await canvas.findByText("No Team Members yet")).toBeVisible();
    await waitFor(() =>
      expect(calls.map((call) => call.path)).toContain(
        `${SUMMARY}?month=2026-09`,
      ),
    );
    await expect(
      canvas.getByRole("link", { name: "Download Excel" }),
    ).toHaveAttribute(
      "href",
      "/api/construction/hrms/attendance/report/monthly?month=2026-09",
    );
  },
};

export const NoTeamMembers: Story = {
  beforeEach: serve(true),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Team Members yet")).toBeVisible();
  },
};

export const WithoutReportAccess: Story = {
  beforeEach() {
    const api = mockApi(() =>
      Response.json(
        { code: "PERMISSION_DENIED", message: "No access." },
        { status: 403 },
      ),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("You do not have access"),
    ).toBeVisible();
  },
};
