import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { LeaveApprovalsPage } from "./leave-approvals-page";
import {
  ME,
  serveLeave,
  storyLeave,
  storyOptions,
  nth,
  type LeaveApiState,
} from "./leave-story-support";

let api: ReturnType<typeof serveLeave>;

const PENDING = storyLeave();
const OWN = storyLeave({
  id: "0199c6a5-0000-7000-8000-0000000000b2",
  memberId: ME,
  memberName: "Arun Selva Kumar",
  appliedByMemberId: ME,
  leaveTypeName: "Sick",
  canDecide: false,
});
const CANCEL = storyLeave({
  id: "0199c6a5-0000-7000-8000-0000000000b3",
  status: "cancellation_requested",
  cancellationReason: "Function postponed",
});

function serve(state: LeaveApiState = {}) {
  return () => {
    api = serveLeave({
      options: storyOptions({ approve: true }),
      approvals: { pending: [PENDING, OWN], cancel_requests: [CANCEL] },
      ...state,
    });
    return api.restore;
  };
}

const meta = {
  title: "HRMS/Leave/Leave Approvals",
  component: LeaveApprovalsPage,
  render: () => (
    <StoryQueries>
      <LeaveApprovalsPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof LeaveApprovalsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ApprovesWithRemarks: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("tab", { name: "Pending (2)" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("tab", { name: "Cancel Requests (1)" }),
    ).toBeVisible();
    // Your own request waits for someone else.
    await expect(
      canvas.getByText("Another approver decides this"),
    ).toBeVisible();
    await userEvent.click(
      nth(canvas.getAllByRole("button", { name: "Approve" }), 0),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByText("Reason:")).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Approval remarks (optional)"),
      "Enjoy",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted(`/leaves/${PENDING.id}/approve`)).toEqual([
      { remarks: "Enjoy", expectedUpdatedAt: PENDING.updatedAt },
    ]);
  },
};

export const RejectNeedsAReason: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      nth(await canvas.findAllByRole("button", { name: "Reject" }), 0),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText("Enter the rejection reason"),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Rejection reason"),
      "Month-end closing",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(api.posted(`/leaves/${PENDING.id}/reject`)).toEqual([
      { reason: "Month-end closing", expectedUpdatedAt: PENDING.updatedAt },
    ]);
  },
};

export const ShowsSomeoneElsesDecision: Story = {
  beforeEach: serve({
    write: (call) =>
      call.path.endsWith("/approve")
        ? Response.json(
            {
              code: "LEAVE_REQUEST_CHANGED",
              message:
                "Someone else acted on this request after you opened it. Reload to see what changed.",
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      nth(await canvas.findAllByRole("button", { name: "Approve" }), 0),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Approve" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Someone else acted on this request",
    );
  },
};

export const DecidesACancellation: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Cancel Requests (1)" }),
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve cancellation" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByText("Function postponed")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Approve cancellation" }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      api.posted(`/leaves/${CANCEL.id}/approve-cancellation`),
    ).toEqual([{ remarks: null, expectedUpdatedAt: CANCEL.updatedAt }]);
  },
};

export const NothingPending: Story = {
  beforeEach: serve({ approvals: {} }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No leave is waiting for a decision."),
    ).toBeVisible();
  },
};

export const NotAnApprover: Story = {
  beforeEach: serve({ options: storyOptions() }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Approvals are not shared with you"),
    ).toBeVisible();
  },
};
