import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import {
  callsTo,
  hasNoHorizontalOverflow,
  mockApi,
  withFreshQueryClient,
} from "@/components/notifications/story-api";
import { signInAs } from "../../.storybook/mocks/auth";

import { ReportSettingsScreen } from "./report-settings-screen";
import { reportSettings } from "./reports.fixtures";

const meta = {
  title: "Reports/Report settings",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/reports/settings" } },
  },
  beforeEach() {
    signInAs("owner");
    return mockApi({
      "GET /reports/settings": () => ({ json: reportSettings }),
      "POST /reports/settings/update": ({ body }) => ({
        json: body,
      }),
    });
  },
  render: () => (
    <AppShell>
      <ReportSettingsScreen />
    </AppShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SaveSettings: Story = {
  play: async ({ canvas, canvasElement }) => {
    const threshold = await canvas.findByLabelText("Attendance threshold (%)");
    await expect(threshold).toHaveValue("75");
    await expect(canvas.getByText(/Default 75%/)).toBeVisible();
    await expect(canvas.getByText(/Default June/)).toBeVisible();

    await userEvent.clear(threshold);
    await userEvent.type(threshold, "80");
    await userEvent.click(canvas.getByLabelText("Starts in"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "April",
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save settings" }),
    );

    await waitFor(async () => {
      await expect(callsTo("POST /reports/settings/update")).toHaveLength(1);
    });
    await expect(callsTo("POST /reports/settings/update")[0]?.body).toEqual({
      thresholdPercent: 80,
      absentInARow: 3,
      minimumClasses: 4,
      academicYearStartMonth: 4,
    });
    await expect(await canvas.findByText("Settings saved.")).toBeVisible();
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

export const RejectsAThresholdOutOfRange: Story = {
  play: async ({ canvas }) => {
    const threshold = await canvas.findByLabelText("Attendance threshold (%)");
    await userEvent.clear(threshold);
    await userEvent.type(threshold, "0");
    const inARow = canvas.getByLabelText("Absent in a row");
    await userEvent.clear(inARow);
    await userEvent.click(
      canvas.getByRole("button", { name: "Save settings" }),
    );

    await expect(
      await canvas.findByText("Enter a whole % from 1 to 100."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter a whole number from 2 to 30."),
    ).toBeVisible();
    await expect(callsTo("POST /reports/settings/update")).toHaveLength(0);
  },
};
