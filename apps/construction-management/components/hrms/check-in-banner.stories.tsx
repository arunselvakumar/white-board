import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import type { HrmsAttendanceToday } from "@/src/queries/hrms-attendance";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { checkedIn, entry, today } from "./attendance-fixtures";
import { CheckInBanner } from "./check-in-banner";

const TODAY_PATH = "/api/construction/hrms/attendance/today";

let calls: ApiCall[] = [];

function serve(body: HrmsAttendanceToday | null) {
  return () => {
    calls = [];
    const api = mockApi((call) => {
      calls.push(call);
      if (call.path !== TODAY_PATH) return undefined;
      return body == null
        ? Response.json(
            { code: "PERMISSION_DENIED", message: "No access." },
            { status: 403 },
          )
        : Response.json(body);
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Attendance/Check-in banner",
  component: CheckInBanner,
  render: () => (
    <StoryQueries>
      <div className="max-w-3xl p-4">
        <CheckInBanner />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof CheckInBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotCheckedIn: Story = {
  beforeEach: serve(today()),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Not checked in")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Check In" }),
    ).toHaveAttribute("href", "/app/workspace/hrms/attendance/my");
  },
};

export const OpenFromAnEarlierDay: Story = {
  beforeEach: serve(
    today({
      openEntry: entry({ date: "2026-10-08" }),
      openNow: false,
    }),
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "An earlier check-in is still open. Close it, then check in.",
      ),
    ).toBeVisible();
  },
};

/** Waits for the read, then expects nothing on screen. */
async function hidden(canvasElement: HTMLElement) {
  await waitFor(() => expect(calls.length).toBeGreaterThan(0));
  await new Promise((resolve) => setTimeout(resolve, 100));
  await expect(canvasElement.querySelector("section")).toBeNull();
}

export const HiddenOnceCheckedIn: Story = {
  beforeEach: serve(checkedIn()),
  play: async ({ canvasElement }) => {
    await hidden(canvasElement);
  },
};

export const HiddenOnAHoliday: Story = {
  beforeEach: serve(today({ state: "holiday", holidayName: "Diwali" })),
  play: async ({ canvasElement }) => {
    await hidden(canvasElement);
  },
};

export const HiddenWithoutAttendanceAccess: Story = {
  beforeEach: serve(null),
  play: async ({ canvasElement }) => {
    await hidden(canvasElement);
  },
};

export const HiddenWithoutCheckInRight: Story = {
  beforeEach: serve(today({ canCreate: false })),
  play: async ({ canvasElement }) => {
    await hidden(canvasElement);
  },
};
