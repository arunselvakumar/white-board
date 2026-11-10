import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { MyLeavesPage } from "./my-leaves-page";
import {
  CASUAL_ID,
  LOP_ID,
  ME,
  PRIYA,
  serveLeave,
  storyLeave,
  storyOptions,
  type LeaveApiState,
} from "./leave-story-support";

let api: ReturnType<typeof serveLeave>;

const MINE = [
  storyLeave({
    id: "0199c6a5-0000-7000-8000-0000000000a1",
    memberId: ME,
    memberName: "Arun Selva Kumar",
    appliedByMemberId: ME,
    status: "pending",
    canWithdraw: true,
    canDecide: false,
  }),
  storyLeave({
    id: "0199c6a5-0000-7000-8000-0000000000a2",
    memberId: ME,
    memberName: "Arun Selva Kumar",
    appliedByMemberId: ME,
    fromDate: "2026-09-14",
    toDate: "2026-09-14",
    totalDays: 1,
    days: [{ date: "2026-09-14", session: "full" }],
    status: "approved",
    approvalRemarks: "Enjoy",
    canRequestCancellation: true,
    canDecide: false,
    decisions: [
      {
        stage: "request",
        level: 1,
        outcome: "approved",
        remarks: "Enjoy",
        deciderMemberId: PRIYA,
        deciderName: "Priya Raman",
        decidedAt: "2026-09-10T05:00:00.000Z",
      },
    ],
  }),
];

function serve(state: LeaveApiState = {}) {
  return () => {
    api = serveLeave({ mine: MINE, ...state });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Leave/My Leaves",
  component: MyLeavesPage,
  render: () => (
    <StoryQueries>
      <MyLeavesPage today="2026-11-06" />
    </StoryQueries>
  ),
} satisfies Meta<typeof MyLeavesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ShowsBalancesAndRequests: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "My Leaves" }),
    ).toBeVisible();
    await expect(canvas.getByText("9 days")).toBeVisible();
    await expect(
      canvas.getByText("2 days taken · 1 day pending"),
    ).toBeVisible();
    await expect(canvas.getByText("11.25 days")).toBeVisible();
    const list = canvas.getByRole("list", { name: "My leave requests" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await expect(within(list).getByText("Pending")).toBeVisible();
    await expect(within(list).getByText("Approved")).toBeVisible();
  },
};

export const AppliesLeaveWithAHalfDay: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Apply Leave" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    // Friday to Monday: the weekend is not counted.
    const to = dialog.getByLabelText("To");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-11-09");
    await expect(await dialog.findByText("2 days")).toBeVisible();
    await expect(dialog.getByText(/Not counted: Sat, 7 Nov/)).toBeVisible();
    await expect(
      dialog.getByRole("group", { name: "Leave balance" }),
    ).toHaveTextContent("Balance: 9 days available");
    await userEvent.click(
      within(
        dialog.getByRole("group", { name: "Session on Mon, 9 Nov" }),
      ).getByRole("button", { name: "Afternoon" }),
    );
    await expect(await dialog.findByText("1.5 days")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Fever");
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await expect(
      await dialog.findByText("Write a reason of at least 10 characters"),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      " and cold since Sunday",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted("/leaves")).toEqual([
      {
        memberId: null,
        leaveTypeId: CASUAL_ID,
        fromDate: "2026-11-06",
        toDate: "2026-11-09",
        days: [{ date: "2026-11-09", session: "afternoon" }],
        reason: "Fever and cold since Sunday",
      },
    ]);
    await expect(
      canvas.getByText("Casual Leave for 2 days sent for approval."),
    ).toBeVisible();
  },
};

export const ShowsWhyApplyingIsRefused: Story = {
  beforeEach: serve({
    write: (call) =>
      call.path === "/api/construction/hrms/leaves"
        ? Response.json(
            {
              code: "LEAVE_OVERLAPS",
              message:
                "There is already leave on 2026-11-06. Withdraw or cancel it first.",
              details: { field: "fromDate" },
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Apply Leave" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Family function in Madurai",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await expect(
      await dialog.findByText(/There is already leave on 2026-11-06/),
    ).toBeVisible();
    await expect(dialog.getByLabelText("From")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const UnpaidLeaveNeedsNoBalance: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Apply Leave" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("combobox", { name: "Leave type" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Loss of Pay (unpaid)" }),
    );
    await expect(
      await dialog.findByText("Loss of Pay is unpaid and needs no balance."),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        api.calls.some(
          (call) =>
            call.path === "/api/construction/hrms/leaves/preview" &&
            (call.body as { leaveTypeId: string }).leaveTypeId === LOP_ID,
        ),
      ).toBe(true),
    );
  },
};

export const ManagerAppliesForSomeone: Story = {
  beforeEach: serve({ options: storyOptions({ applyForOthers: true }) }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Apply Leave" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Team Member" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Priya Raman" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Family function in Madurai",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted("/leaves")).toEqual([
      expect.objectContaining({ memberId: PRIYA }),
    ]);
  },
};

export const RequestsCancellation: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /Casual Leave, 14 Sept? 2026, Approved/,
      }),
    );
    const sheet = within(await body.findByRole("dialog"));
    // The sheet slides in; wait until the decision line is shown.
    await waitFor(() =>
      expect(
        sheet.getByText(/Approved by Priya Raman on 10 Sept? 2026 — Enjoy/),
      ).toBeVisible(),
    );
    await userEvent.click(
      sheet.getByRole("button", { name: "Request Cancellation" }),
    );
    await expect(
      await sheet.findByText("Say why the leave is cancelled"),
    ).toBeVisible();
    await userEvent.type(
      sheet.getByLabelText("Cancellation reason"),
      "Trip postponed",
    );
    await userEvent.click(
      sheet.getByRole("button", { name: "Request Cancellation" }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      api.posted(`/leaves/${MINE[1]?.id ?? ""}/request-cancellation`),
    ).toEqual([
      {
        reason: "Trip postponed",
        expectedUpdatedAt: "2026-10-10T06:00:00.000Z",
      },
    ]);
  },
};

export const WithdrawsAPendingRequest: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /Casual Leave, 6 Nov 2026 – 9 Nov 2026, Pending/,
      }),
    );
    const sheet = within(await body.findByRole("dialog"));
    await userEvent.click(
      sheet.getByRole("button", { name: "Withdraw request" }),
    );
    await waitFor(() =>
      expect(api.posted(`/leaves/${MINE[0]?.id ?? ""}/withdraw`)).toHaveLength(
        1,
      ),
    );
  },
};

export const NoRequestsYet: Story = {
  beforeEach: serve({ mine: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No leave requests yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Apply Leave" }),
    ).toHaveLength(2);
  },
};

export const NotShared: Story = {
  beforeEach: serve({ options: storyOptions({ read: false, apply: false }) }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Leave is not shared with you"),
    ).toBeVisible();
  },
};
