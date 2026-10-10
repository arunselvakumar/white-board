import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import type {
  HrmsRotationTemplate,
  HrmsShiftTemplate,
} from "@/src/queries/hrms-shifts";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { ShiftsPage } from "./shifts-page";

const SHIFTS = "/api/construction/hrms/shift-templates";
const ROTATIONS = "/api/construction/hrms/rotation-templates";
const AT = "2026-10-10T06:00:00.000Z";

const GENERAL: HrmsShiftTemplate = {
  id: "0199d0a0-0000-7000-8000-000000000101",
  name: "General",
  startTime: "09:30",
  endTime: "18:30",
  workingDays: [1, 2, 3, 4, 5, 6],
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 10,
  overtimeAllowed: true,
  isActive: true,
  inUse: true,
  createdAt: AT,
  updatedAt: AT,
};

const NIGHT: HrmsShiftTemplate = {
  ...GENERAL,
  id: "0199d0a0-0000-7000-8000-000000000102",
  name: "Night",
  startTime: "22:00",
  endTime: "06:00",
  workingDays: [1, 3, 5],
  workingHours: 7.5,
  overtimeAllowed: false,
  isActive: false,
  inUse: false,
};

const CREW: HrmsRotationTemplate = {
  id: "0199d0a0-0000-7000-8000-000000000201",
  name: "Crew A",
  type: "week",
  daysPerCycle: 7,
  slots: [
    GENERAL.id,
    GENERAL.id,
    NIGHT.id,
    NIGHT.id,
    GENERAL.id,
    GENERAL.id,
    null,
  ],
  isActive: true,
  inUse: false,
  createdAt: AT,
  updatedAt: AT,
};

let calls: ApiCall[] = [];
let deleteResponse: () => Response = () => new Response(null, { status: 204 });

function posted(path: string): unknown[] {
  return calls
    .filter((call) => call.method === "POST" && call.path === path)
    .map((call) => call.body);
}

function serve(shifts: HrmsShiftTemplate[], rotations: HrmsRotationTemplate[]) {
  return () => {
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === SHIFTS)
        return Response.json({ items: shifts });
      if (call.method === "GET" && call.path === ROTATIONS)
        return Response.json({ items: rotations });
      if (call.method === "POST" && call.path === SHIFTS)
        return Response.json(
          { ...GENERAL, ...(call.body as object), inUse: false },
          { status: 201 },
        );
      if (call.method === "POST" && call.path === ROTATIONS)
        return Response.json(
          { ...CREW, ...(call.body as object) },
          { status: 201 },
        );
      if (call.path.endsWith("/delete")) return deleteResponse();
      return undefined;
    });
    return () => {
      api.restore();
      deleteResponse = () => new Response(null, { status: 204 });
    };
  };
}

const meta = {
  title: "HRMS/Shifts",
  component: ShiftsPage,
  render: (args) => (
    <StoryQueries>
      <ShiftsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ShiftsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoShiftsYet: Story = {
  beforeEach: serve([], []),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("No shifts yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Shift" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Rotations" }));
    await expect(await canvas.findByText("No rotations yet")).toBeVisible();
    await expect(canvas.getByText(/Add an active shift first/)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Rotation" }),
    ).toBeDisabled();
  },
};

export const ListsShiftsAndRotations: Story = {
  beforeEach: serve([GENERAL, NIGHT], [CREW]),
  play: async ({ canvas, userEvent }) => {
    const shifts = within(
      await canvas.findByRole("list", { name: "Shift templates" }),
    );
    await expect(
      shifts.getByText(
        "09:30–18:30 · Mon–Sat · 8 h, half day 4 h · 10 min grace",
      ),
    ).toBeVisible();
    await expect(
      shifts.getByText(
        "22:00–06:00 (next day) · Mon, Wed, Fri · 7.5 h, half day 4 h · 10 min grace",
      ),
    ).toBeVisible();
    await expect(shifts.getByText("Inactive")).toBeVisible();
    await expect(shifts.getByText("In use")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Rotations" }));
    const rotations = within(
      await canvas.findByRole("list", { name: "Rotations" }),
    );
    await expect(
      rotations.getByText("Week · 7 days: General ×4, Night ×2, Week Off ×1"),
    ).toBeVisible();
  },
};

export const AddsANightShift: Story = {
  beforeEach: serve([], []),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Shift" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Shift" }),
    );
    await userEvent.type(dialog.getByLabelText("Shift name"), "Night");
    await fireEvent.change(dialog.getByLabelText("Start time"), {
      target: { value: "22:00" },
    });
    await fireEvent.change(dialog.getByLabelText("End time"), {
      target: { value: "06:00" },
    });
    await expect(await dialog.findByText(/Ends the next day/)).toBeVisible();
    const hours = dialog.getByLabelText("Working hours");
    await userEvent.clear(hours);
    await userEvent.type(hours, "7.5");
    await userEvent.click(dialog.getByRole("button", { name: "Saturday" }));
    await userEvent.click(
      dialog.getByRole("switch", { name: "Overtime allowed" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save shift" }));
    await waitFor(() =>
      expect(posted(SHIFTS)).toEqual([
        {
          name: "Night",
          startTime: "22:00",
          endTime: "06:00",
          workingDays: [1, 2, 3, 4, 5],
          workingHours: 7.5,
          halfDayHours: 4,
          graceMinutes: 15,
          overtimeAllowed: true,
          isActive: true,
        },
      ]),
    );
  },
};

export const RefusesHoursThatDoNotFit: Story = {
  beforeEach: serve([], []),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Shift" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Shift name"), "Short");
    await fireEvent.change(dialog.getByLabelText("End time"), {
      target: { value: "13:00" },
    });
    const halfDay = dialog.getByLabelText("Half-day hours");
    await userEvent.clear(halfDay);
    await userEvent.type(halfDay, "9");
    await userEvent.click(dialog.getByRole("button", { name: "Save shift" }));
    await expect(
      await dialog.findByText("The shift is only 4h long"),
    ).toBeVisible();
    await expect(
      dialog.getByText("Use fewer hours than the working hours"),
    ).toBeVisible();
    await expect(posted(SHIFTS)).toHaveLength(0);
  },
};

export const ExplainsAShiftInUse: Story = {
  beforeEach: serve([GENERAL], []),
  play: async ({ canvas, canvasElement, userEvent }) => {
    deleteResponse = () =>
      Response.json(
        {
          code: "SHIFT_TEMPLATE_IN_USE",
          message:
            "This shift is used by a rotation or a shift assignment, so it cannot be deleted. Mark it inactive instead.",
        },
        { status: 409 },
      );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for General" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(
      await body.findByRole("alertdialog", { name: "Delete General?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Mark it inactive instead.",
    );
  },
};

export const AddsACustomCycleRotation: Story = {
  args: { initialTab: "rotations" },
  beforeEach: serve([GENERAL, NIGHT], [CREW]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Rotation" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Rotation" }),
    );
    await expect(dialog.getByText("Cycle shifts (7 days)")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Rotation name"), "Two on");
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Rotation type" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Custom Cycle" }),
    );
    await expect(
      await dialog.findByText("Cycle shifts (2 days)"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Days per cycle" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "3 days" }));
    await userEvent.click(dialog.getByRole("combobox", { name: "Day 3" }));
    // The inactive Night shift is not offered.
    await expect(body.queryByRole("option", { name: "Night" })).toBeNull();
    await userEvent.click(
      await body.findByRole("option", { name: "Week Off" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save rotation" }),
    );
    await waitFor(() =>
      expect(posted(ROTATIONS)).toEqual([
        {
          name: "Two on",
          type: "custom_cycle",
          daysPerCycle: 3,
          slots: [GENERAL.id, GENERAL.id, null],
          isActive: true,
        },
      ]),
    );
  },
};

export const NeedsAShiftInTheCycle: Story = {
  args: { initialTab: "rotations" },
  beforeEach: serve([GENERAL], [CREW]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Rotation" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Rotation name"), "Idle");
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Set every day to" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Week Off" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save rotation" }),
    );
    await expect(
      await dialog.findByText("Make at least one day a shift"),
    ).toBeVisible();
    await expect(posted(ROTATIONS)).toHaveLength(0);
  },
};
