import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  APPROVED,
  BILL_APPROVED,
  BILL_DRAFT,
  BILL_PENDING,
  BILL_RCM,
  BILL_REVERSED,
  billOf,
  CONTRACTOR,
  DRAFT,
  PENDING,
  PROJECT,
  RCM,
  REVERSED,
} from "./contractor-bill-fixtures";
import { ContractorBillDetail } from "./contractor-bill-detail";
import {
  CONTRACTOR_BILLS_API,
  posted,
  serveContractorBills,
} from "./contractor-bill-stories-api";

const meta = {
  title: "Contracts/Contractor Bills/Detail",
  component: ContractorBillDetail,
  args: { projectId: PROJECT, id: BILL_APPROVED },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${PROJECT}/contractor-bills/${BILL_APPROVED}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <ContractorBillDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof ContractorBillDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

const draft = serveContractorBills({ bill: DRAFT });

/**
 * A draft: “Draft” until submitted, the suggested retention within its cap,
 * deductions typed with the net as you type, then saved.
 */
export const DraftWithSuggestions: Story = {
  args: { id: BILL_DRAFT },
  beforeEach: draft.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Contractor Bill Draft" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        /Retention 5% of the gross, up to 5% of the Work Order: at most ₹4,730\.00 on this bill\./,
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", {
        name: "Use suggested retention ₹4,730.00",
      }),
    ).toBeVisible();
    await expect(canvas.getByText("Net as typed ₹1,06,898.00")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Add deduction" }),
    );
    await userEvent.type(canvas.getByLabelText("Deduction 2 amount"), "1000");
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(
      await canvas.findByText("Write what it is for."),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Deduction 2 description"),
      "Water charges",
    );
    await userEvent.click(canvas.getByLabelText("Deduction 2 kind"));
    await userEvent.click(
      await body.findByRole("option", { name: "Material issued at cost" }),
    );
    await expect(canvas.getByText("Net as typed ₹1,05,898.00")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(
        posted(
          draft.holder.current,
          `${CONTRACTOR_BILLS_API}/${BILL_DRAFT}/update`,
        ),
      ).toEqual({
        billDate: DRAFT.billDate,
        measuredUpTo: DRAFT.measuredUpTo,
        isFinal: false,
        remarks: null,
        deductions: [
          { kind: "retention", amount: 4_730_00, description: null },
          {
            kind: "material_at_cost",
            amount: 1_000_00,
            description: "Water charges",
          },
        ],
        expectedUpdatedAt: DRAFT.updatedAt,
      }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit for approval" }),
    );
    await waitFor(() =>
      expect(
        posted(
          draft.holder.current,
          `${CONTRACTOR_BILLS_API}/${BILL_DRAFT}/submit`,
        ),
      ).toEqual({ expectedUpdatedAt: DRAFT.updatedAt }),
    );
  },
};

const over = serveContractorBills({
  bill: DRAFT,
  write: (call) =>
    call.path.endsWith("/refresh")
      ? Response.json(
          {
            code: "WORK_ORDER_QUANTITY_EXCEEDED",
            message:
              "Line 2.2 would be billed to 41, more than the 40 on the Work Order. Amend the Work Order first.",
            details: {
              lineId: DRAFT.lines[1]?.workOrderLineId,
              cumulative: "41.0000",
              workOrderQuantity: "40.0000",
            },
          },
          { status: 409 },
        )
      : undefined,
});

/** Refreshing takes rows past the Work Order: the server's 409 says which line. */
export const OverQuantity: Story = {
  args: { id: BILL_DRAFT },
  beforeEach: over.beforeEach,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Refresh measurements" }),
    );
    await expect(
      await canvas.findByText(
        "Line 2.2 would be billed to 41, more than the 40 on the Work Order. Amend the Work Order first.",
      ),
    ).toBeVisible();
  },
};

const finalPending = billOf({
  ...PENDING,
  isFinal: true,
});
const pending = serveContractorBills({
  bill: finalPending,
  write: (call) =>
    call.path.endsWith("/approve") &&
    (call.body as { confirmUnbilled?: boolean }).confirmUnbilled !== true
      ? Response.json(
          {
            code: "BILL_FINAL_UNBILLED",
            message:
              "One Work Order line is not fully billed. Approve the Final bill anyway to close the Work Order short?",
            details: {
              lines: [
                {
                  lineId: DRAFT.lines[1]?.workOrderLineId,
                  itemNo: "2.2",
                  billed: "12.0000",
                  workOrderQuantity: "40.0000",
                },
              ],
            },
          },
          { status: 409 },
        )
      : Response.json(finalPending),
});

/** Pending a Final bill: Approve asks to close the Work Order short, then confirms. */
export const PendingFinal: Story = {
  args: { id: BILL_PENDING },
  beforeEach: pending.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Pending approval")).toBeVisible();
    await expect(canvas.getByText("RA 3 · Final")).toBeVisible();
    await expect(
      canvas.queryByRole("form", { name: "Bill details" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    const dialog = within(
      await body.findByRole("alertdialog", {
        name: "Close the Work Order short?",
      }),
    );
    await expect(dialog.getByText("Line 2.2")).toBeVisible();
    await expect(dialog.getByText("12 of 40")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Approve and close" }),
    );
    await waitFor(() =>
      expect(
        posted(
          pending.holder.current,
          `${CONTRACTOR_BILLS_API}/${BILL_PENDING}/approve`,
        ),
      ).toEqual({
        confirmUnbilled: true,
        expectedUpdatedAt: finalPending.updatedAt,
      }),
    );
  },
};

const rejecting = serveContractorBills({ bill: PENDING });

/** An approver rejects with a reason; the measurements are freed. */
export const PendingReject: Story = {
  args: { id: BILL_PENDING },
  beforeEach: rejecting.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reject" }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Reject Contractor Bill CB/26-27/00003?",
      }),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "JMR disputed");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(
        posted(
          rejecting.holder.current,
          `${CONTRACTOR_BILLS_API}/${BILL_PENDING}/reject`,
        ),
      ).toEqual({
        reason: "JMR disputed",
        expectedUpdatedAt: PENDING.updatedAt,
      }),
    );
  },
};

const approved = serveContractorBills({ bill: APPROVED });

/**
 * Approved: the abstract with each line's measurements, deductions, GST
 * and net, the TDS estimate, the invoice in Payments, and Reverse.
 */
export const ApprovedWithInvoice: Story = {
  beforeEach: approved.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("Invoice CB/26-27/00002 in Payments"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Velan Constructions's invoices" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/payments/contractors/${CONTRACTOR}`,
    );
    await expect(canvas.getByText("Gross ₹94,600.00")).toBeVisible();
    await expect(
      canvas.getAllByText("₹1,01,898.00", { selector: "dd" }),
    ).toHaveLength(2);
    await expect(
      canvas.getByText(
        /TDS estimate \(393 \(194C\)\) at 1% of ₹94,600\.00: about ₹946\.00\. Estimate only/,
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText("Mobilisation advance recovery (10 % of the gross)"),
    ).toBeVisible();
    await expect(canvas.getByText("₹7,130.00")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download PDF" }),
    ).toHaveAttribute("href", `${CONTRACTOR_BILLS_API}/${BILL_APPROVED}/pdf`);

    await userEvent.click(
      canvas.getByRole("button", { name: "Show 2 measurements" }),
    );
    const rows = within(
      await canvas.findByRole("list", { name: "Measurements of 2.1" }),
    );
    await expect(rows.getByText("6 × 3.5 × 2.5 × 1.5 =")).toBeVisible();
    await expect(rows.getByText("Wing A · Ground Floor")).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Reverse bill" }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Reverse Contractor Bill CB/26-27/00002?",
      }),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Measured twice");
    await userEvent.click(dialog.getByRole("button", { name: "Reverse bill" }));
    await waitFor(() =>
      expect(
        posted(
          approved.holder.current,
          `${CONTRACTOR_BILLS_API}/${BILL_APPROVED}/reverse`,
        ),
      ).toEqual({
        reason: "Measured twice",
        expectedUpdatedAt: APPROVED.updatedAt,
      }),
    );
  },
};

const reversed = serveContractorBills({ bill: REVERSED });

/** Reversed: the reason, and no actions but the PDF. */
export const Reversed: Story = {
  args: { id: BILL_REVERSED },
  beforeEach: reversed.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/^Reversed .* by Meena Raghavan$/),
    ).toBeVisible();
    await expect(
      canvas.getByText(/Footings F5 and F6 were measured twice\./),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "More" })).toBeNull();
    await expect(canvas.queryByText(/in Payments$/)).toBeNull();
  },
};

const rcm = serveContractorBills({ bill: RCM });

/** Reverse charge: GST shown, taken back out, and not in the net. */
export const ReverseCharge: Story = {
  args: { id: BILL_RCM },
  beforeEach: rcm.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/· Reverse charge$/)).toBeVisible();
    await expect(
      canvas.getByText("GST under reverse charge (the Company pays it)"),
    ).toBeVisible();
    await expect(canvas.getByText("− ₹17,028.00")).toBeVisible();
    await expect(
      canvas.getAllByText("₹89,870.00", { selector: "dd" }),
    ).toHaveLength(2);
  },
};

const quantities = serveContractorBills({
  bill: billOf({ allowed: { ...APPROVED.allowed, reverse: false } }, false),
});

/** Without Financial: quantities only, no money and no TDS estimate. */
export const WithoutFinancial: Story = {
  beforeEach: quantities.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Rates and amounts need the Contractor Bill/),
    ).toBeVisible();
    await expect(canvas.queryByText(/₹/)).toBeNull();
    await expect(canvas.queryByText(/TDS estimate/)).toBeNull();
    await expect(canvas.getByText("80.5 cum")).toBeVisible();
    await expect(
      canvas.getByText("Deductions: Retention, Mobilisation advance recovery"),
    ).toBeVisible();
  },
};

const phone = serveContractorBills({ bill: DRAFT });

/** At phone width the abstract and editor are cards; nothing scrolls sideways. */
export const PhoneWidth: Story = {
  args: { id: BILL_DRAFT },
  beforeEach: phone.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("list", { name: "Abstract" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Show 2 measurements" }),
    );
    await expect(
      await canvas.findByRole("list", { name: "Measurements of 2.1" }),
    ).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
