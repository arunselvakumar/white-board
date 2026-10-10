import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import type { HrmsAttendanceToday } from "@/src/queries/hrms-attendance";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { mockGeolocation } from "../../.storybook/mocks/geolocation";
import { checkedIn, entry, today } from "./attendance-fixtures";
import { MyAttendancePage } from "./my-attendance-page";

const ATTENDANCE = "/api/construction/hrms/attendance";

let calls: ApiCall[] = [];

function posted(path: string): unknown[] {
  return calls
    .filter((call) => call.method === "POST" && call.path === path)
    .map((call) => call.body);
}

/**
 * Serves `/today` from `views` (the next one after each POST) and answers
 * POSTs with `post` (a created entry by default).
 */
function serve(
  views: HrmsAttendanceToday[],
  options: {
    post?: (call: ApiCall) => Response | undefined;
    geolocation?: Parameters<typeof mockGeolocation>[0];
  } = {},
) {
  return () => {
    calls = [];
    let index = 0;
    const restoreGeo =
      options.geolocation == null ? null : mockGeolocation(options.geolocation);
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === `${ATTENDANCE}/today`)
        return Response.json(views[Math.min(index, views.length - 1)]);
      if (call.method === "POST") {
        const answer =
          options.post?.(call) ??
          Response.json(entry({ approvalStatus: "none" }), { status: 201 });
        if (answer.ok) index += 1;
        return answer;
      }
      return undefined;
    });
    return () => {
      api.restore();
      restoreGeo?.();
    };
  };
}

const meta = {
  title: "HRMS/Attendance/My Attendance",
  component: MyAttendancePage,
  render: () => (
    <StoryQueries>
      <MyAttendancePage />
    </StoryQueries>
  ),
} satisfies Meta<typeof MyAttendancePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotCheckedIn: Story = {
  beforeEach: serve([today(), checkedIn()]),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Not checked in" }),
    ).toBeVisible();
    await expect(canvas.getByText("No check-ins today yet.")).toBeVisible();
    await expect(canvas.getByText("General · 09:00–18:00")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check In" }));
    // GPS is off: no location is sent.
    await waitFor(() => expect(posted(`${ATTENDANCE}/check-in`)).toEqual([{}]));
    await expect(
      await canvas.findByRole("heading", { name: "Checked in" }),
    ).toBeVisible();
  },
};

export const CheckedInWithTimer: Story = {
  beforeEach: serve([checkedIn({ gpsRequirement: "required" })], {
    geolocation: { latitude: 13.0827, longitude: 80.2707, accuracy: 14 },
    post: () => Response.json(entry({ checkOutAt: new Date().toISOString() })),
  }),
  play: async ({ canvas, userEvent }) => {
    const timer = await canvas.findByRole("timer", {
      name: "Time since check-in",
    });
    await expect(timer.textContent).toMatch(/^02:00:\d\d$/);
    const list = within(canvas.getByRole("list", { name: "Today's entries" }));
    await expect(list.getByText(/In \d/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check Out" }));
    await waitFor(() =>
      expect(posted(`${ATTENDANCE}/check-out`)).toEqual([
        { latitude: 13.0827, longitude: 80.2707, accuracyMetres: 14 },
      ]),
    );
  },
};

export const ChecksInInsideTheFence: Story = {
  beforeEach: serve([today({ gpsRequirement: "required" }), checkedIn()], {
    geolocation: { latitude: 13.0827, longitude: 80.2707, accuracy: 9 },
  }),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        "Check-in needs your location inside your office or site fence.",
      ),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Check In" }));
    await waitFor(() =>
      expect(posted(`${ATTENDANCE}/check-in`)).toEqual([
        { latitude: 13.0827, longitude: 80.2707, accuracyMetres: 9 },
      ]),
    );
  },
};

export const OutsideFence: Story = {
  beforeEach: serve([today({ gpsRequirement: "required" })], {
    geolocation: { latitude: 13.0927, longitude: 80.2707, accuracy: 9 },
    post: () =>
      Response.json(
        {
          code: "OUTSIDE_FENCE",
          message:
            "You are about 1,012 m outside Chennai HO. Move inside the fence to check in.",
          details: { field: "location" },
        },
        { status: 400 },
      ),
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Check In" }),
    );
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByText("Outside Fence")).toBeVisible();
    await expect(alert).toHaveTextContent("1,012 m outside Chennai HO");
  },
};

export const LocationPermissionDenied: Story = {
  beforeEach: serve([today({ gpsRequirement: "required" })], {
    geolocation: { code: 1 },
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Check In" }),
    );
    const alert = await canvas.findByRole("alert");
    await expect(
      within(alert).getByText("Location permission denied"),
    ).toBeVisible();
    await expect(alert).toHaveTextContent("Allow location for this site");
    await expect(posted(`${ATTENDANCE}/check-in`)).toEqual([]);
  },
};

export const LocationTimedOut: Story = {
  beforeEach: serve([today({ gpsRequirement: "required" })], {
    geolocation: { code: 3 },
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Check In" }),
    );
    await expect(
      within(await canvas.findByRole("alert")).getByText("Location timed out"),
    ).toBeVisible();
  },
};

export const OfficeNotConfigured: Story = {
  beforeEach: serve([today({ gpsRequirement: "required", fenceCount: 0 })]),
  play: async ({ canvas }) => {
    const alert = await canvas.findByRole("alert");
    await expect(
      within(alert).getByText("Office location is not configured"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Check In" }),
    ).toBeDisabled();
  },
};

export const RecordOnlyOutsideGoesToApproval: Story = {
  beforeEach: serve(
    [
      today({ gpsRequirement: "record_only" }),
      checkedIn({ gpsRequirement: "record_only" }),
    ],
    {
      // Location refused: record only still checks in, without one.
      geolocation: { code: 1 },
      post: () =>
        Response.json(entry({ approvalStatus: "pending", outOfFence: true }), {
          status: 201,
        }),
    },
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Check In" }),
    );
    await waitFor(() => expect(posted(`${ATTENDANCE}/check-in`)).toEqual([{}]));
    await expect(
      await canvas.findByText(/You checked in outside your fence/),
    ).toBeVisible();
  },
};

const OPEN_EARLIER = entry({
  date: "2026-10-08",
  checkInAt: "2026-10-08T03:30:00.000Z",
});

export const OpenFromAnEarlierDay: Story = {
  beforeEach: serve(
    [
      today({ openEntry: OPEN_EARLIER, openNow: false }),
      today({
        pending: [
          {
            ...OPEN_EARLIER,
            source: "missed_checkout",
            approvalStatus: "pending",
            checkOutAt: "2026-10-08T13:00:00.000Z",
            reason: "Phone died at the site",
          },
        ],
      }),
    ],
    {
      post: (call) =>
        call.path.endsWith("/missed-checkout")
          ? Response.json(
              entry({ approvalStatus: "pending", source: "missed_checkout" }),
            )
          : undefined,
    },
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Open Attendance" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Check In" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Missed Checkout" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Missed Checkout" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await expect(await dialog.findByText("Enter the time")).toBeVisible();
    await fireEvent.change(dialog.getByLabelText("Checkout time"), {
      target: { value: "18:30" },
    });
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Phone died at the site",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() =>
      expect(posted(`${ATTENDANCE}/missed-checkout`)).toEqual([
        {
          entryId: OPEN_EARLIER.id,
          checkOutDate: "2026-10-08",
          checkOutTime: "18:30",
          reason: "Phone died at the site",
          expectedUpdatedAt: OPEN_EARLIER.updatedAt,
        },
      ]),
    );
    const waiting = within(
      await canvas.findByRole("list", { name: "Waiting for approval" }),
    );
    await expect(waiting.getByText("Missed checkout")).toBeVisible();
  },
};

export const AddsABackdatedDay: Story = {
  beforeEach: serve([today()], {
    post: (call) => {
      const body = call.body as { date: string };
      return body.date === "2026-09-01"
        ? Response.json(
            {
              code: "BACKDATED_CREATE_BLOCKED",
              message:
                "HRMS → Attendance entries older than 7 days cannot be created. The earliest date allowed is 2026-10-03.",
            },
            { status: 403 },
          )
        : Response.json(
            entry({ source: "manual", approvalStatus: "pending" }),
            {
              status: 201,
            },
          );
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Backdated Attendance" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Backdated Attendance" }),
    );
    await expect(dialog.getByLabelText("Date")).toHaveValue("2026-10-09");
    await fireEvent.change(dialog.getByLabelText("Date"), {
      target: { value: "2026-09-01" },
    });
    await fireEvent.change(dialog.getByLabelText("Check-in time"), {
      target: { value: "09:00" },
    });
    await fireEvent.change(dialog.getByLabelText("Check-out time"), {
      target: { value: "18:00" },
    });
    await userEvent.type(dialog.getByLabelText("Reason"), "Client office");
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await expect(
      await dialog.findByText(/The earliest date allowed is 2026-10-03/),
    ).toBeVisible();

    await fireEvent.change(dialog.getByLabelText("Date"), {
      target: { value: "2026-10-08" },
    });
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() =>
      expect(posted(`${ATTENDANCE}/manual`).at(-1)).toEqual({
        date: "2026-10-08",
        checkInTime: "09:00",
        checkOutTime: "18:00",
        reason: "Client office",
      }),
    );
  },
};

export const HolidayWithNoPermissionToCheckIn: Story = {
  beforeEach: serve([
    today({
      canCreate: false,
      state: "holiday",
      holidayName: "Ayudha Puja",
      day: { ...today().day, status: "holiday" },
    }),
  ]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Holiday: Ayudha Puja")).toBeVisible();
    await expect(
      canvas.getByText("Your Permission Matrix does not let you check in."),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Check In" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add Backdated Attendance" }),
    ).toBeNull();
  },
};

export const NoAccess: Story = {
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
