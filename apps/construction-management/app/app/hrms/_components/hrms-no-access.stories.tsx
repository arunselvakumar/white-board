import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { HRMS_PATH } from "@/lib/hrms-nav";

import { BranchesPage } from "./branches-page";
import { EmployeeSalaryGrid } from "./employee-salary-grid";
import { HolidaysPage } from "./holidays-page";
import { HrmsSettingsForm } from "./hrms-settings-form";
import { HrmsShell } from "./hrms-shell";
import { LeaveConfigurationPage } from "./leave/leave-configuration-page";
import { SalaryStructuresList } from "./salary-structures-list";
import { NewSalaryStructureScreen } from "./salary-structure-form";
import { ShiftManagementPage } from "./shift-management-page";
import { ShiftsPage } from "./shifts-page";

/**
 * HRMS Configuration opened by a member whose Permission Matrix lacks the
 * menu (CM-320): every read answers 403, and the page shows "You don't
 * have access to …" under the HRMS tabs instead of a generic error.
 */

function forbidden() {
  const api = mockApi(() =>
    Response.json(
      {
        code: "PERMISSION_DENIED",
        message:
          "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      },
      { status: 403 },
    ),
  );
  return api.restore;
}

function at(path: string, page: ReactNode) {
  const href = `${HRMS_PATH}/configuration/${path}`;
  return {
    parameters: { nextjs: { navigation: { pathname: href } } },
    beforeEach: forbidden,
    render: () => (
      <StoryQueries>
        <HrmsShell>{page}</HrmsShell>
      </StoryQueries>
    ),
  };
}

async function showsNoAccess(canvasElement: HTMLElement, what: string) {
  const canvas = within(canvasElement);
  await expect(
    await canvas.findByText(`You don't have access to ${what}`),
  ).toBeVisible();
  await expect(
    canvas.getByText(
      "Your Permission Matrix does not include it. Ask the Owner if you need it.",
    ),
  ).toBeVisible();
  // The tabs stay, so the member can go elsewhere.
  await expect(
    canvas.getByRole("navigation", { name: "HRMS sections" }),
  ).toBeVisible();
  await expect(canvas.queryByText("Couldn't load this page")).toBeNull();
}

const meta = {
  title: "HRMS/No access",
  component: HrmsShell,
  args: { children: null },
} satisfies Meta<typeof HrmsShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Settings: Story = {
  ...at("settings", <HrmsSettingsForm />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "HRMS Settings");
  },
};

export const Branches: Story = {
  ...at("branches", <BranchesPage showMap={false} />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Branches & Sites");
  },
};

export const Holidays: Story = {
  ...at("holidays", <HolidaysPage initialYear={2026} />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Holidays");
  },
};

export const Shifts: Story = {
  ...at("shifts", <ShiftsPage />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Shifts");
  },
};

export const ShiftManagement: Story = {
  ...at("shift-management", <ShiftManagementPage />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Shift Management");
  },
};

export const LeaveTypes: Story = {
  ...at("leave-types", <LeaveConfigurationPage today="2026-10-10" />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Leave Types & Structures");
  },
};

export const SalaryStructures: Story = {
  ...at("salary-structures", <SalaryStructuresList />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Salary Structures");
  },
};

export const AddSalaryStructure: Story = {
  ...at("salary-structures/new", <NewSalaryStructureScreen />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Salary Structures");
  },
};

export const Employees: Story = {
  ...at("employees", <EmployeeSalaryGrid />),
  play: async ({ canvasElement }) => {
    await showsNoAccess(canvasElement, "Employees");
  },
};
