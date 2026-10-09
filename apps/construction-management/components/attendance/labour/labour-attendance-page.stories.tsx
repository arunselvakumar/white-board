import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { formatPaise } from "@/components/money/money-input";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  AT,
  DATE,
  EMPTY_SHEET,
  MASON,
  MURUGAN,
  MONTH,
  PROJECT_ID,
  DHURESH,
  DHURESH_SAVED,
  SHEET,
  KAVITHA,
} from "./labour-attendance-fixtures";
import { LabourAttendancePage } from "./labour-attendance-page";

const API = "/api/construction/labour/attendance/labour";
const SHEET_PATH = `${API}/sheet?projectId=${PROJECT_ID}&date=${DATE}`;

let api: ReturnType<typeof mockApi>;

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Attendance/Labour",
  component: LabourAttendancePage,
  args: { projectId: PROJECT_ID, initialDate: DATE },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-5xl p-4">
        <LabourAttendancePage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof LabourAttendancePage>;

export default meta;
type Story = StoryObj<typeof meta>;

function sheetApi(post?: (call: ApiCall) => Response | undefined) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === SHEET_PATH)
        return Response.json(SHEET);
      if (call.method === "POST" && post != null) return post(call);
      return undefined;
    });
    return api.restore;
  };
}

/**
 * Mark one labourer, add an overtime line on a saved row, and save: the body
 * carries only the changed rows (the weekly-holiday row pre-filled Holiday
 * counts as changed), and the saved row's loaded `updatedAt`.
 */
export const MarkingSheet: Story = {
  beforeEach: sheetApi((call) =>
    call.path === `${API}/mark`
      ? Response.json({ items: [DHURESH_SAVED, DHURESH_SAVED, DHURESH_SAVED] })
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    const dhuresh = within(
      await canvas.findByRole("listitem", { name: "Dhuresh Nawin" }),
    );
    const murugan = within(
      canvas.getByRole("listitem", { name: "Murugan Ganesan" }),
    );
    // The weekly holiday is pre-filled and marked unsaved.
    await expect(
      murugan.getByRole("button", { name: "Murugan Ganesan Holiday" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(murugan.getByText("Unsaved change")).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Kavitha Murugan Present" }),
    );
    await userEvent.click(
      dhuresh.getByRole("button", { name: "Dhuresh Nawin overtime" }),
    );
    await userEvent.click(
      dhuresh.getByRole("button", { name: "Add overtime line" }),
    );
    await userEvent.type(
      dhuresh.getByLabelText("Dhuresh Nawin overtime 1 hours"),
      "2",
    );
    await expect(
      dhuresh.getByLabelText("Dhuresh Nawin earns"),
    ).toHaveTextContent(formatPaise(90_000));

    await userEvent.click(canvas.getByRole("button", { name: "Save 3" }));
    await expect(await canvas.findByText("Saved 3 Labours.")).toBeVisible();
    await expect(posted()).toHaveLength(1);
    await expect(posted()[0]?.body).toEqual({
      projectId: PROJECT_ID,
      date: DATE,
      marks: [
        { labourId: MURUGAN, status: "holiday", shift: null, overtime: [] },
        {
          labourId: DHURESH,
          status: "present",
          shift: "General",
          overtime: [
            { labourCategoryId: MASON, hours: "2", ratePerHour: 10_000 },
          ],
        },
        { labourId: KAVITHA, status: "present", shift: null, overtime: [] },
      ],
      expected: { [DHURESH]: AT },
    });
  },
};

/** Copy yesterday, then select two rows and mark them Absent in one tap. */
export const BulkMark: Story = {
  beforeEach: sheetApi((call) =>
    call.path === `${API}/mark` ? Response.json({ items: [] }) : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Copy yesterday" }),
    );
    // Kavitha was Half Day yesterday; Dhuresh is already saved today and stays.
    await expect(
      canvas.getByRole("button", { name: "Kavitha Murugan Half Day" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Kavitha Murugan" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Murugan Ganesan" }),
    );
    await expect(canvas.getByText("2 selected")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark selected Absent" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Murugan Ganesan Absent" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(canvas.getByRole("button", { name: "Save 2" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      projectId: PROJECT_ID,
      date: DATE,
      marks: [
        { labourId: MURUGAN, status: "absent", shift: null, overtime: [] },
        { labourId: KAVITHA, status: "absent", shift: "Shift 1", overtime: [] },
      ],
    });
  },
};

/** A server error about one labourer shows on that labourer's row. */
export const RowError: Story = {
  beforeEach: sheetApi(() =>
    Response.json(
      {
        code: "ATTENDANCE_CHANGED",
        message:
          "Kavitha Murugan's day was changed after you opened it. Reload to see the latest.",
        details: { labourId: KAVITHA },
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Kavitha Murugan Present" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save 2" }));
    const kavitha = within(
      canvas.getByRole("listitem", { name: "Kavitha Murugan" }),
    );
    await expect(await kavitha.findByRole("alert")).toHaveTextContent(
      "Kavitha Murugan's day was changed",
    );
    await expect(
      canvas.getByText("Not saved: see Kavitha Murugan."),
    ).toBeVisible();
  },
};

/** The month grid: day codes, overtime hours and totals per labourer. */
export const MonthGrid: Story = {
  args: { initialView: "month" },
  beforeEach: () => {
    api = mockApi((call) => {
      if (call.path === `${API}/month?projectId=${PROJECT_ID}&month=2026-10`)
        return Response.json(MONTH);
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas }) => {
    const dhuresh = within(
      await canvas.findByRole("row", { name: "Dhuresh Nawin" }),
    );
    await expect(
      dhuresh.getByLabelText("Dhuresh Nawin 2026-10-02 PL"),
    ).toHaveTextContent("PL");
    await expect(
      dhuresh.getByLabelText("Dhuresh Nawin 2026-10-01 P"),
    ).toHaveTextContent("P2");
    await expect(dhuresh.getByText(formatPaise(160_000))).toBeVisible();
  },
};

/** A Project with no labourers points to Masters → Labours. */
export const EmptyProject: Story = {
  beforeEach: () => {
    api = mockApi((call) =>
      call.path === SHEET_PATH ? Response.json(EMPTY_SHEET) : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Labours on this Project"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Labours" }),
    ).toHaveAttribute("href", "/app/masters/labours");
  },
};
