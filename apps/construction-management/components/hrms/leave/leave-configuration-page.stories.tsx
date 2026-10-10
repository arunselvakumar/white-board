import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { LeaveConfigurationPage } from "./leave-configuration-page";
import {
  CASUAL_ID,
  PRIVILEGE_ID,
  PRIYA,
  serveLeave,
  storyOptions,
  STORY_STRUCTURE,
  type LeaveApiState,
} from "./leave-story-support";

let api: ReturnType<typeof serveLeave>;

function serve(state: LeaveApiState = {}) {
  return () => {
    api = serveLeave({
      options: storyOptions({ configure: true, manageBalances: true }),
      ...state,
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Leave/Types and Structures",
  component: LeaveConfigurationPage,
  render: () => (
    <StoryQueries>
      <LeaveConfigurationPage today="2026-10-10" />
    </StoryQueries>
  ),
} satisfies Meta<typeof LeaveConfigurationPage>;

export default meta;
type Story = StoryObj<typeof meta>;

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

export const ShowsTheSeedTypes: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "Leave types" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    const privilege = rowNamed(list, "Privilege Leave");
    await expect(
      within(privilege).getByText(
        "15 days a year · 1.25 days a month · Carry forward up to 15 days",
      ),
    ).toBeVisible();
    await expect(within(privilege).getByText("Default")).toBeVisible();
    await expect(
      within(rowNamed(list, "Loss of Pay")).getByText("Unpaid"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Sick")).getByText("Inactive"),
    ).toBeVisible();
  },
};

export const AddsAMonthlyLeaveType: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add leave type" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "Work From Home");
    await userEvent.type(dialog.getByLabelText("Days a year"), "24");
    await userEvent.click(dialog.getByRole("radio", { name: "Monthly" }));
    // Monthly needs the credit; the day defaults to the 1st.
    await userEvent.click(
      dialog.getByRole("button", { name: "Add leave type" }),
    );
    await expect(
      await dialog.findByText("Enter the days credited each month, like 1.25"),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Days credited each month"),
      "2",
    );
    await userEvent.click(
      dialog.getByRole("switch", { name: "Carry forward unused days" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Most days carried forward"),
      "6",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Add leave type" }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted("/leave-types")).toEqual([
      {
        name: "Work From Home",
        yearlyLimit: 24,
        isPaid: true,
        requiresApproval: true,
        approvalLevels: null,
        maxConsecutiveDays: null,
        accrualMode: "periodic",
        accrualFrequency: "monthly",
        accrualDay: 1,
        creditPerPeriod: 2,
        carryForward: true,
        maxCarryForward: 6,
        allowAdvanceUse: false,
      },
    ]);
  },
};

export const ShowsTheServersFieldError: Story = {
  beforeEach: serve({
    write: (call) =>
      call.path === "/api/construction/hrms/leave-types"
        ? Response.json(
            {
              code: "LEAVE_TYPE_NAME_IN_USE",
              message: "A leave type with this name already exists.",
              details: { field: "name" },
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add leave type" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "casual leave");
    await userEvent.type(dialog.getByLabelText("Days a year"), "12");
    await userEvent.click(
      dialog.getByRole("button", { name: "Add leave type" }),
    );
    await expect(
      await dialog.findByText("A leave type with this name already exists."),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const DeactivatesFromTheRowMenu: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Casual Leave" }),
    );
    // In use: no Delete, only Deactivate.
    await expect(
      await body.findByRole("menuitem", { name: "Deactivate" }),
    ).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(body.getByRole("menuitem", { name: "Deactivate" }));
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) =>
            call.path ===
            `/api/construction/hrms/leave-types/${CASUAL_ID}/deactivate`,
        ),
      ).toBe(true),
    );
  },
};

export const NoLeaveTypes: Story = {
  beforeEach: serve({ types: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No leave types yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add leave type" }),
    ).toBeVisible();
  },
};

export const AddsAStructure: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Structures" }),
    );
    await expect(await canvas.findByText("Office staff")).toBeVisible();
    await expect(
      canvas.getByText("Casual Leave 10 days · Privilege Leave 15 days"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add structure" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Name"), "Site staff");
    await userEvent.click(
      dialog.getByRole("button", { name: "Add structure" }),
    );
    await expect(
      await dialog.findByText("Choose at least one leave type"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Casual Leave" }),
    );
    await userEvent.type(dialog.getByLabelText("Days of Casual Leave"), "8");
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Privilege Leave" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Add structure" }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted("/leave-structures")).toEqual([
      {
        name: "Site staff",
        description: null,
        lines: [
          { leaveTypeId: CASUAL_ID, entitlementDays: 8 },
          { leaveTypeId: PRIVILEGE_ID, entitlementDays: null },
        ],
      },
    ]);
  },
};

export const AssignsAStructure: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Structures" }),
    );
    await expect(
      await canvas.findByText("Office staff from 1 Jan 2026"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Assign structure" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Assign" }));
    await expect(
      await dialog.findByText("Choose at least one Team Member"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Priya Raman/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted("/leave-structures/assignments")).toEqual([
      {
        structureId: STORY_STRUCTURE.id,
        memberIds: [PRIYA],
        effectiveFrom: "2026-01-01",
      },
    ]);
  },
};

export const NoStructures: Story = {
  beforeEach: serve({ structures: [], assignments: [] }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Structures" }),
    );
    await expect(
      await canvas.findByText("No leave structures yet"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add structure" }),
    ).toBeVisible();
  },
};
