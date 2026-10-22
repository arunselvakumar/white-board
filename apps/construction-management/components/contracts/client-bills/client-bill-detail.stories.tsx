import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  APPROVED,
  BILL_APPROVED,
  BILL_DRAFT,
  BILL_OUT_OF_STATE,
  BILL_PENDING,
  BILL_REVERSED,
  billOf,
  CLIENT,
  DRAFT,
  OUT_OF_STATE,
  PENDING,
  PROJECT,
  REVERSED,
} from "./client-bill-fixtures";
import { ClientBillDetail } from "./client-bill-detail";
import {
  CLIENT_BILLS_API,
  posted,
  serveClientBills,
} from "./client-bill-stories-api";

const meta = {
  title: "Contracts/Client Bills/Detail",
  component: ClientBillDetail,
  args: { projectId: PROJECT, id: BILL_APPROVED },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${PROJECT}/client-bills/${BILL_APPROVED}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <ClientBillDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof ClientBillDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

const draft = serveClientBills({ bill: DRAFT });

/**
 * A draft: “Draft” until submitted, the tax invoice's GSTINs and place of
 * supply, the masonry line marked as a deviation past the BOQ, the
 * suggested retention within its cap and the net receivable as you type.
 */
export const DraftWithDeviation: Story = {
  args: { id: BILL_DRAFT },
  beforeEach: draft.beforeEach,
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Client Bill Draft" }),
    ).toBeVisible();
    const invoice = within(canvas.getByRole("region", { name: "Tax invoice" }));
    await expect(invoice.getByText("33AAACA1234A1Z5")).toBeVisible();
    await expect(invoice.getByText("33AABCT1332L1ZU")).toBeVisible();
    await expect(
      invoice.getByText(/Place of supply Tamil Nadu \(33\)/),
    ).toBeVisible();
    const abstract = within(canvas.getByRole("list", { name: "Abstract" }));
    await expect(abstract.getByText("Deviation")).toBeVisible();
    await expect(
      abstract.getByText(/Billed 19.7676 cum past the BOQ \(19.77% over\)/),
    ).toBeVisible();
    await expect(abstract.getByText(/of BOQ 100 cum/)).toBeVisible();
    await expect(
      canvas.getByText(
        /Retention 10% of the gross, up to 5% of the BOQ: at most ₹61,078\.41 on this bill\./,
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText("Net receivable as typed ₹6,59,646.85"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add deduction" }),
    );
    await userEvent.type(canvas.getByLabelText("Deduction 2 amount"), "5000");
    await userEvent.type(
      canvas.getByLabelText("Deduction 2 description"),
      "Water and power",
    );
    await expect(
      canvas.getByText("Net receivable as typed ₹6,54,646.85"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(
        posted(
          draft.holder.current,
          `${CLIENT_BILLS_API}/${BILL_DRAFT}/update`,
        ),
      ).toMatchObject({
        deductions: [
          { kind: "retention", amount: 61_078_41 },
          { kind: "other", amount: 5_000_00, description: "Water and power" },
        ],
        expectedUpdatedAt: DRAFT.updatedAt,
      }),
    );
  },
};

const outOfState = serveClientBills({ bill: OUT_OF_STATE });

/** A Kerala site with only a Tamil Nadu GSTIN: the warning, and IGST. */
export const GstinNotInState: Story = {
  args: { id: BILL_OUT_OF_STATE },
  beforeEach: outOfState.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Company GSTIN in this state"),
    ).toBeVisible();
    await expect(canvas.getByText(/no GSTIN in Kerala \(32\)/)).toBeVisible();
    const summary = within(
      canvas.getByRole("region", { name: "GST and net receivable" }),
    );
    await expect(summary.getByText("IGST 18%")).toBeVisible();
    await expect(summary.getByText(/Inter-state \(IGST\)/)).toBeVisible();
    await expect(summary.queryByText(/^CGST/)).toBeNull();
  },
};

const pending = serveClientBills({
  bill: PENDING,
  write: (call) =>
    call.path === `${CLIENT_BILLS_API}/${BILL_PENDING}/approve`
      ? Response.json({
          ...PENDING,
          status: "approved",
          invoiceId: APPROVED.invoiceId,
          allowed: { ...PENDING.allowed, approve: false, reject: false },
        })
      : undefined,
});

/** Pending: Approve creates the receivable invoice to the Client. */
export const PendingApprove: Story = {
  args: { id: BILL_PENDING },
  beforeEach: pending.beforeEach,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve" }),
    );
    await waitFor(() =>
      expect(
        posted(
          pending.holder.current,
          `${CLIENT_BILLS_API}/${BILL_PENDING}/approve`,
        ),
      ).toMatchObject({ expectedUpdatedAt: PENDING.updatedAt }),
    );
    await expect(
      await canvas.findByText("Invoice RA/26-27/00003 in Payments"),
    ).toBeVisible();
  },
};

const approved = serveClientBills({ bill: APPROVED });

/** Approved: the receivable invoice in Payments, the GST split and the net receivable. */
export const ApprovedWithInvoice: Story = {
  beforeEach: approved.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("link", {
        name: "Open Tamil Nadu Housing Board's invoices",
      }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/payments/clients/${CLIENT}`,
    );
    const summary = within(
      canvas.getByRole("region", { name: "GST and net receivable" }),
    );
    await expect(summary.getByText("CGST 9%")).toBeVisible();
    await expect(summary.getByText("SGST 9%")).toBeVisible();
    await expect(summary.getByText("₹7,20,725.26")).toBeVisible();
    await expect(summary.getByText("₹6,59,646.85")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Tax invoice PDF" }),
    ).toHaveAttribute("href", `${CLIENT_BILLS_API}/${BILL_APPROVED}/pdf`);
    await userEvent.click(canvas.getByRole("button", { name: "More" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Reverse bill",
      }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByText(
        /nothing received against it/,
      ),
    ).toBeVisible();
  },
};

const reversed = serveClientBills({ bill: REVERSED });

/** Reversed: the reason, who and when. */
export const Reversed: Story = {
  args: { id: BILL_REVERSED },
  beforeEach: reversed.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Masonry on the first floor was measured twice/),
    ).toBeVisible();
  },
};

const quantities = serveClientBills({ bill: billOf(APPROVED, false) });

/** Without Financial: quantities only. */
export const WithoutFinancial: Story = {
  beforeEach: quantities.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("list", { name: "Abstract" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Rates and amounts need the Client Bill's Financial permission.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("region", { name: "GST and net receivable" }),
    ).toBeNull();
  },
};

const phone = serveClientBills({ bill: DRAFT });

/** At 375 px the abstract, the tax invoice and the editor are cards; nothing scrolls sideways. */
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
