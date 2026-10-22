import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  AMENDED,
  CANCELLED,
  CLOSED,
  DRAFT,
  PENDING,
  PROJECT,
  REJECTED,
  WO_DRAFT,
  WO_ISSUED,
  WO_PENDING,
  workOrderOf,
} from "./work-order-fixtures";
import { WorkOrderDetail } from "./work-order-detail";
import {
  posted,
  serveWorkOrders,
  WORK_ORDERS_API,
} from "./work-order-stories-api";

const meta = {
  title: "Contracts/Work Orders/Detail",
  component: WorkOrderDetail,
  args: { projectId: PROJECT, id: WO_ISSUED, today: "2027-02-28" },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${PROJECT}/work-orders/${WO_ISSUED}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <WorkOrderDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof WorkOrderDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

const draft = serveWorkOrders({ workOrder: DRAFT });

/** A draft: “Draft” until submitted; edit, submit, or delete it. */
export const Draft: Story = {
  args: { id: WO_DRAFT },
  beforeEach: draft.beforeEach,
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Work Order Draft" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/work-orders/${WO_DRAFT}/edit`,
    );
    await expect(canvas.queryByRole("link", { name: "Amend" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit for approval" }),
    );
    await waitFor(() =>
      expect(
        posted(draft.holder.current, `${WORK_ORDERS_API}/${WO_DRAFT}/submit`),
      ).toEqual({ expectedUpdatedAt: DRAFT.updatedAt }),
    );
  },
};

const rejected = serveWorkOrders({ workOrder: REJECTED });

/** A rejected Work Order is a draft again, with its number and the reason. */
export const Rejected: Story = {
  args: { id: WO_DRAFT },
  beforeEach: rejected.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Rejected by Meena Raghavan"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "The PCC rate is above the BOQ rate; check with the QS.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Work Order WO/26-27/00004" }),
    ).toBeVisible();
  },
};

const pending = serveWorkOrders({ workOrder: PENDING });

/** Pending approval: an approver rejects it with a reason, or approves it. */
export const PendingReject: Story = {
  args: { id: WO_PENDING },
  beforeEach: pending.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Pending approval")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Reject Work Order WO/26-27/00005?",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText("Write why it is rejected."),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Rate too high");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(
        posted(
          pending.holder.current,
          `${WORK_ORDERS_API}/${WO_PENDING}/reject`,
        ),
      ).toEqual({
        reason: "Rate too high",
        expectedUpdatedAt: PENDING.updatedAt,
      }),
    );
  },
};

const issued = serveWorkOrders({ workOrder: AMENDED });

/**
 * Issued and amended once: the BOQ warning, Amend, Download PDF, and the
 * revision history opening to the old terms and lines.
 */
export const IssuedWithRevision: Story = {
  beforeEach: issued.beforeEach,
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("Revision 1")).toBeVisible();
    await expect(
      canvas.getByText(/BOQ item 2\.1: ordering 90, the BOQ has nothing left/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", `${WORK_ORDERS_API}/${WO_ISSUED}/pdf`);
    await expect(canvas.getByRole("link", { name: "Amend" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/work-orders/${WO_ISSUED}/amend`,
    );
    await expect(canvas.getByText("Total ₹8,33,255.00")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /^Revision 0/ }));
    const old = within(
      await canvas.findByRole("table", { name: "Revision 0 lines" }),
    );
    await expect(old.getByText("800 cum")).toBeVisible();
    await expect(old.getByText("₹3,20,000.00")).toBeVisible();
    await expect(
      canvas.getByText(/Deeper excavation at the pump house/),
    ).toBeVisible();
  },
};

const closing = serveWorkOrders({ workOrder: workOrderOf() });

/** Close an issued Work Order with a date and a reason (from More). */
export const Close: Story = {
  beforeEach: closing.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "More" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "Close" }));
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Close Work Order WO/26-27/00003?",
      }),
    );
    await expect(dialog.getByLabelText("Close date")).toHaveValue("2027-02-28");
    await userEvent.type(dialog.getByLabelText("Reason"), "Work complete");
    await userEvent.click(
      dialog.getByRole("button", { name: "Close Work Order" }),
    );
    await waitFor(() =>
      expect(
        posted(closing.holder.current, `${WORK_ORDERS_API}/${WO_ISSUED}/close`),
      ).toEqual({
        closedOn: "2027-02-28",
        reason: "Work complete",
        expectedUpdatedAt: workOrderOf().updatedAt,
      }),
    );
  },
};

const closed = serveWorkOrders({ workOrder: CLOSED });

/** Closed: the date and reason, and no actions but the PDF. */
export const Closed: Story = {
  args: { id: CLOSED.id },
  beforeEach: closed.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Closed 28 Feb 2027")).toBeVisible();
    await expect(
      canvas.getByText("Work complete; final bill passed."),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "More" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Amend" })).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Download PDF" }),
    ).toBeVisible();
  },
};

const cancelled = serveWorkOrders({ workOrder: CANCELLED });

/** Cancelled: the date and reason. */
export const Cancelled: Story = {
  args: { id: CANCELLED.id },
  beforeEach: cancelled.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Cancelled 25 Oct 2026"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Raised against the wrong Contractor."),
    ).toBeVisible();
    await expect(canvas.queryByText("More than the BOQ has left")).toBeNull();
  },
};

const quantities = serveWorkOrders({
  workOrder: workOrderOf({ viewerFlags: ["read", "print"] }, false),
});

/** Without Financial (and only Read and Print): quantities only, no actions. */
export const WithoutFinancial: Story = {
  beforeEach: quantities.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Rates and amounts need the Work Order/),
    ).toBeVisible();
    await expect(canvas.queryByText(/₹/)).toBeNull();
    await expect(canvas.queryByText("Mobilisation advance")).toBeNull();
    await expect(canvas.getByText("1,000 cum")).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Amend" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "More" })).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Download PDF" }),
    ).toBeVisible();
  },
};

const phone = serveWorkOrders({ workOrder: AMENDED });

/** At phone width the lines scroll inside their frame, never the page. */
export const PhoneWidth: Story = {
  beforeEach: phone.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("table", { name: "Lines" }),
    ).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
