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
  MOHAN,
  MONTH,
  PROJECT_ID,
  RAJU,
  RAJU_SAVED,
  SHEET,
  SITA,
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
      ? Response.json({ items: [RAJU_SAVED, RAJU_SAVED, RAJU_SAVED] })
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    const raju = within(
      await canvas.findByRole("listitem", { name: "Raju Pawar" }),
    );
    const mohan = within(canvas.getByRole("listitem", { name: "Mohan Patil" }));
    // The weekly holiday is pre-filled and marked unsaved.
    await expect(
      mohan.getByRole("button", { name: "Mohan Patil Holiday" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(mohan.getByText("Unsaved change")).toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("button", { name: "Sita Kale Present" }),
    );
    await userEvent.click(
      raju.getByRole("button", { name: "Raju Pawar overtime" }),
    );
    await userEvent.click(
      raju.getByRole("button", { name: "Add overtime line" }),
    );
    await userEvent.type(
      raju.getByLabelText("Raju Pawar overtime 1 hours"),
      "2",
    );
    await expect(raju.getByLabelText("Raju Pawar earns")).toHaveTextContent(
      formatPaise(90_000),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save 3" }));
    await expect(await canvas.findByText("Saved 3 labourers.")).toBeVisible();
    await expect(posted()).toHaveLength(1);
    await expect(posted()[0]?.body).toEqual({
      projectId: PROJECT_ID,
      date: DATE,
      marks: [
        { labourId: MOHAN, status: "holiday", shift: null, overtime: [] },
        {
          labourId: RAJU,
          status: "present",
          shift: "General",
          overtime: [
            { labourCategoryId: MASON, hours: "2", ratePerHour: 10_000 },
          ],
        },
        { labourId: SITA, status: "present", shift: null, overtime: [] },
      ],
      expected: { [RAJU]: AT },
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
    // Sita was Half Day yesterday; Raju is already saved today and stays.
    await expect(
      canvas.getByRole("button", { name: "Sita Kale Half Day" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Sita Kale" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select Mohan Patil" }),
    );
    await expect(canvas.getByText("2 selected")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark selected Absent" }),
    );
    await expect(
      canvas.getByRole("button", { name: "Mohan Patil Absent" }),
    ).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(canvas.getByRole("button", { name: "Save 2" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      projectId: PROJECT_ID,
      date: DATE,
      marks: [
        { labourId: MOHAN, status: "absent", shift: null, overtime: [] },
        { labourId: SITA, status: "absent", shift: "Shift 1", overtime: [] },
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
          "Sita Kale's day was changed after you opened it. Reload to see the latest.",
        details: { labourId: SITA },
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Sita Kale Present" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save 2" }));
    const sita = within(canvas.getByRole("listitem", { name: "Sita Kale" }));
    await expect(await sita.findByRole("alert")).toHaveTextContent(
      "Sita Kale's day was changed",
    );
    await expect(canvas.getByText("Not saved: see Sita Kale.")).toBeVisible();
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
    const raju = within(await canvas.findByRole("row", { name: "Raju Pawar" }));
    await expect(
      raju.getByLabelText("Raju Pawar 2026-10-02 PL"),
    ).toHaveTextContent("PL");
    await expect(
      raju.getByLabelText("Raju Pawar 2026-10-01 P"),
    ).toHaveTextContent("P2");
    await expect(raju.getByText(formatPaise(160_000))).toBeVisible();
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
      await canvas.findByText("No labourers on this Project"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Labours" }),
    ).toHaveAttribute("href", "/app/masters/labours");
  },
};
