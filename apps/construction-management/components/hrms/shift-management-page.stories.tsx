import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type {
  HrmsRotationTemplate,
  HrmsShiftAssignments,
  HrmsShiftTemplate,
} from "@/src/queries/hrms-shifts";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { ShiftManagementPage } from "./shift-management-page";

const SHIFTS = "/api/construction/hrms/shift-templates";
const ROTATIONS = "/api/construction/hrms/rotation-templates";
const ASSIGNMENTS = "/api/construction/hrms/employees/shift-assignments";
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

const CREW: HrmsRotationTemplate = {
  id: "0199d0a0-0000-7000-8000-000000000201",
  name: "Crew A",
  type: "custom_cycle",
  daysPerCycle: 3,
  slots: [GENERAL.id, GENERAL.id, null],
  isActive: true,
  inUse: true,
  createdAt: AT,
  updatedAt: AT,
};

const PRABHU = "0199d0a0-0000-7000-8000-0000000000a1";
const MEENA = "0199d0a0-0000-7000-8000-0000000000a2";
const RAVI = "0199d0a0-0000-7000-8000-0000000000a3";

const LIST: HrmsShiftAssignments = {
  today: "2026-10-10",
  items: [
    {
      member: {
        memberId: MEENA,
        name: "Meena Rajan",
        memberType: "hrms",
        designationName: "Accountant",
        active: true,
      },
      current: null,
      upcoming: null,
      history: [],
    },
    {
      member: {
        memberId: PRABHU,
        name: "Prabhu Saravanan",
        memberType: "normal",
        designationName: "Site Engineer",
        active: true,
      },
      current: {
        id: "0199d0a0-0000-7000-8000-000000000301",
        memberId: PRABHU,
        kind: "shift",
        templateId: GENERAL.id,
        templateName: "General",
        effectiveFrom: "2026-09-01",
        effectiveTo: "2026-10-31",
        createdAt: AT,
      },
      upcoming: {
        id: "0199d0a0-0000-7000-8000-000000000302",
        memberId: PRABHU,
        kind: "rotation",
        templateId: CREW.id,
        templateName: "Crew A",
        effectiveFrom: "2026-11-01",
        effectiveTo: null,
        createdAt: AT,
      },
      history: [
        {
          id: "0199d0a0-0000-7000-8000-000000000302",
          memberId: PRABHU,
          kind: "rotation",
          templateId: CREW.id,
          templateName: "Crew A",
          effectiveFrom: "2026-11-01",
          effectiveTo: null,
          createdAt: AT,
        },
        {
          id: "0199d0a0-0000-7000-8000-000000000301",
          memberId: PRABHU,
          kind: "shift",
          templateId: GENERAL.id,
          templateName: "General",
          effectiveFrom: "2026-09-01",
          effectiveTo: "2026-10-31",
          createdAt: AT,
        },
      ],
    },
    {
      member: {
        memberId: RAVI,
        name: "Ravi Kumar",
        memberType: "normal",
        designationName: null,
        active: false,
      },
      current: null,
      upcoming: null,
      history: [],
    },
  ],
};

let calls: ApiCall[] = [];
let assignResponse: () => Response = () =>
  Response.json({ items: [] }, { status: 201 });

function assigned(): unknown[] {
  return calls
    .filter((call) => call.method === "POST" && call.path === ASSIGNMENTS)
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
      if (call.method === "GET" && call.path === ASSIGNMENTS)
        return Response.json(LIST);
      if (call.method === "POST" && call.path === ASSIGNMENTS)
        return assignResponse();
      return undefined;
    });
    return () => {
      api.restore();
      assignResponse = () => Response.json({ items: [] }, { status: 201 });
    };
  };
}

const meta = {
  title: "HRMS/ShiftManagement",
  component: ShiftManagementPage,
  render: () => (
    <StoryQueries>
      <ShiftManagementPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof ShiftManagementPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoShiftsToAssign: Story = {
  beforeEach: serve([{ ...GENERAL, isActive: false }], []),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No active shifts or rotations"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to Shifts" }),
    ).toHaveAttribute("href", "/app/workspace/hrms/configuration/shifts");
  },
};

export const ShowsEachMembersShift: Story = {
  beforeEach: serve([GENERAL], [CREW]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Team Members" }),
    );
    await expect(
      list.getByText("General (shift) since 1 Sept 2026"),
    ).toBeVisible();
    await expect(
      list.getByText("From 1 Nov 2026: Crew A (rotation)"),
    ).toBeVisible();
    await expect(
      list.getAllByText("Standard day from HRMS Settings"),
    ).toHaveLength(2);
    await expect(list.getByText("Joining Pending")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Assign shift" }),
    ).toBeDisabled();

    await userEvent.click(
      list.getByRole("button", { name: "History of Prabhu Saravanan" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Shift history of Prabhu Saravanan",
      }),
    );
    const entries = within(dialog.getByRole("list", { name: "Shift history" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    await expect(entries).toEqual([
      "Crew A (rotation)1 Nov 2026 – until changed",
      "General (shift)1 Sept 2026 – 31 Oct 2026",
    ]);
  },
};

export const AssignsARotationToSelectedMembers: Story = {
  beforeEach: serve([GENERAL], [CREW]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: /Meena Rajan/ }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Prabhu Saravanan/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Assign shift (2)" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Assign shift" }),
    );
    await expect(dialog.getByText(/2 Team Members will work/)).toBeVisible();
    await userEvent.click(dialog.getByRole("radio", { name: "A rotation" }));
    await userEvent.click(dialog.getByRole("combobox", { name: "Rotation" }));
    await userEvent.click(await body.findByRole("option", { name: "Crew A" }));
    await expect(dialog.getByLabelText("From")).toHaveValue("2026-10-10");
    await userEvent.click(dialog.getByRole("button", { name: "Assign" }));
    await waitFor(() =>
      expect(assigned()).toEqual([
        {
          memberIds: [MEENA, PRABHU],
          shiftTemplateId: null,
          rotationTemplateId: CREW.id,
          effectiveFrom: "2026-10-10",
        },
      ]),
    );
    await expect(
      await canvas.findByText("Assigned to 2 Team Members."),
    ).toBeVisible();
  },
};

export const ExplainsALaterAssignment: Story = {
  beforeEach: serve([GENERAL], [CREW]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    assignResponse = () =>
      Response.json(
        {
          code: "SHIFT_ASSIGNMENT_BEFORE_LATEST",
          message:
            "A chosen Team Member already has a shift from a later date. Choose that date or a later one.",
          details: { field: "effectiveFrom", memberIds: [PRABHU] },
        },
        { status: 400 },
      );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: /Prabhu Saravanan/ }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Assign shift (1)" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByText(/Prabhu Saravanan will work/)).toBeVisible();
    await userEvent.click(dialog.getByRole("combobox", { name: "Shift" }));
    await userEvent.click(await body.findByRole("option", { name: "General" }));
    await userEvent.click(dialog.getByRole("button", { name: "Assign" }));
    await expect(
      await dialog.findByText(/already has a shift from a later date/),
    ).toBeVisible();
    await expect(dialog.getByLabelText("From")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const NeedsATemplate: Story = {
  beforeEach: serve([GENERAL], [CREW]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Select all shown" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Assign shift (3)" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Assign" }));
    await expect(
      await dialog.findByText("Choose what they work"),
    ).toBeVisible();
    await expect(assigned()).toHaveLength(0);
  },
};
