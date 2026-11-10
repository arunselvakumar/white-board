import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { HrmsSettingsModel } from "@/src/queries/hrms-settings";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { HrmsSettingsForm } from "./hrms-settings-form";

const SETTINGS_PATH = "/api/construction/hrms/settings";

const DEFAULTS: HrmsSettingsModel = {
  gpsRequirement: "disabled",
  graceMinutes: 15,
  workingHoursPerDay: 8,
  halfDayHours: 4,
  workingDays: [1, 2, 3, 4, 5],
  leaveApprovalLevels: 1,
  leaveYear: "calendar",
  carryForwardEnabled: false,
  carryForwardMaxDays: null,
  leaveAccrualEnabled: false,
  autoSalaryCalculation: false,
  salaryCalculationDay: null,
  ptStateCode: null,
  updatedAt: null,
};

const SAVED_AT = "2026-10-10T06:00:00.000Z";

let lastCalls: ApiCall[] = [];

function echoSaved(body: unknown): Response {
  const { expectedUpdatedAt: _expected, ...settings } = body as Record<
    string,
    unknown
  >;
  return Response.json({ ...settings, updatedAt: SAVED_AT });
}

let updateResponse: (body: unknown) => Response = echoSaved;

function updates(): unknown[] {
  return lastCalls
    .filter((call) => call.path === `${SETTINGS_PATH}/update`)
    .map((call) => call.body);
}

const meta = {
  title: "HRMS/SettingsForm",
  component: HrmsSettingsForm,
  beforeEach() {
    lastCalls = [];
    const api = mockApi((call) => {
      lastCalls.push(call);
      if (call.path === SETTINGS_PATH) return Response.json(DEFAULTS);
      if (call.path === `${SETTINGS_PATH}/update`)
        return updateResponse(call.body);
      return undefined;
    });
    return () => {
      api.restore();
      updateResponse = echoSaved;
    };
  },
  render: () => (
    <StoryQueries>
      <HrmsSettingsForm />
    </StoryQueries>
  ),
} satisfies Meta<typeof HrmsSettingsForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsTheDefaults: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "HRMS Settings" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/These are the starting values until you save/),
    ).toBeVisible();
    for (const section of ["Attendance", "Leave", "Salary"])
      await expect(canvas.getByRole("region", { name: section })).toBeVisible();
    await expect(canvas.getByRole("radio", { name: "Disabled" })).toBeChecked();
    await expect(canvas.getByLabelText("Grace period")).toHaveValue("15");
    await expect(canvas.getByLabelText("Working hours per day")).toHaveValue(
      "8",
    );
    await expect(canvas.getByLabelText("Half-day hours")).toHaveValue("4");
    const days = within(canvas.getByRole("group", { name: "Working days" }));
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
      await expect(days.getByRole("button", { name: day })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    await expect(
      days.getByRole("button", { name: "Saturday" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      canvas.getByRole("radio", { name: "Calendar year" }),
    ).toBeChecked();
    await expect(
      canvas.getByRole("combobox", { name: "Approval levels" }),
    ).toHaveTextContent("1 level");
    await expect(
      canvas.getByRole("combobox", { name: "Professional tax state" }),
    ).toHaveTextContent("None");
    // Values that only matter when their switch is on stay hidden.
    await expect(
      canvas.queryByLabelText("Most days carried forward"),
    ).toBeNull();
    await expect(canvas.queryByLabelText("Day of the month")).toBeNull();
  },
};

export const SavesChanges: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("radio", { name: "Required" }),
    );
    const grace = canvas.getByLabelText("Grace period");
    await userEvent.clear(grace);
    await userEvent.type(grace, "10");
    const hours = canvas.getByLabelText("Working hours per day");
    await userEvent.clear(hours);
    await userEvent.type(hours, "8.5");
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Working days" })).getByRole(
        "button",
        { name: "Saturday" },
      ),
    );
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Approval levels" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "2 levels" }),
    );
    await userEvent.click(
      canvas.getByRole("radio", { name: "Financial year" }),
    );
    await userEvent.click(
      canvas.getByRole("switch", { name: "Carry forward unused leave" }),
    );
    await userEvent.type(
      await canvas.findByLabelText("Most days carried forward"),
      "12.5",
    );
    await userEvent.click(
      canvas.getByRole("switch", { name: "Credit leave every month" }),
    );
    await userEvent.click(
      canvas.getByRole("switch", { name: "Calculate salaries automatically" }),
    );
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Day of the month" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "25" }));
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Professional tax state" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Karnataka" }),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Changes saved.")).toBeVisible();
    await expect(updates()).toEqual([
      {
        gpsRequirement: "required",
        graceMinutes: 10,
        workingHoursPerDay: 8.5,
        halfDayHours: 4,
        workingDays: [1, 2, 3, 4, 5, 6],
        leaveApprovalLevels: 2,
        leaveYear: "financial",
        carryForwardEnabled: true,
        carryForwardMaxDays: 12.5,
        leaveAccrualEnabled: true,
        autoSalaryCalculation: true,
        salaryCalculationDay: 25,
        ptStateCode: "29",
        expectedUpdatedAt: null,
      },
    ]);
    // The starting-values note goes once the settings are saved.
    await expect(
      canvas.queryByText(/These are the starting values/),
    ).toBeNull();
  },
};

export const RejectsHalfDayAboveWorkingHours: Story = {
  play: async ({ canvas, userEvent }) => {
    const halfDay = await canvas.findByLabelText("Half-day hours");
    await userEvent.clear(halfDay);
    await userEvent.type(halfDay, "9");
    await userEvent.click(
      canvas.getByRole("switch", { name: "Calculate salaries automatically" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("Use fewer hours than a full working day"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Choose the day salaries are calculated"),
    ).toBeVisible();
    await expect(halfDay).toHaveAttribute("aria-invalid", "true");
    await expect(updates()).toHaveLength(0);
  },
};

export const ShowsSomeoneElsesSave: Story = {
  play: async ({ canvas, userEvent }) => {
    updateResponse = () =>
      Response.json(
        {
          code: "HRMS_SETTINGS_CHANGED",
          message:
            "Someone else changed these settings after you opened them. Reload to see their changes.",
        },
        { status: 409 },
      );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save changes" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Someone else changed these settings",
    );
    await waitFor(() => expect(updates()).toHaveLength(1));
  },
};
