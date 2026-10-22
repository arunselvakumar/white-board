import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  CLIENT_BILL_ID,
  CLIENT_ID,
  CLIENT_INVOICE,
  CONTRACTOR_ID,
  CONTRACTOR_INVOICE,
  PARTLY_PAID_INVOICE,
  partyMoneyHandler,
  PROJECT_ID,
  SUPPLIER_ID,
  SUPPLIER_STATEMENT,
} from "./party-fixtures";
import { PartyMoneyPage } from "./party-money-page";

const FINANCE = "/api/construction/finance";

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown[] {
  return api.calls.mock.calls
    .filter(([call]) => call.method === "POST" && call.path === path)
    .map(([call]) => call.body);
}

function writes(call: ApiCall): Response | undefined {
  if (call.method !== "POST") return undefined;
  if (call.path === `${FINANCE}/invoices/${PARTLY_PAID_INVOICE.id}/settle`)
    return Response.json(PARTLY_PAID_INVOICE, { status: 201 });
  if (call.path === `${FINANCE}/invoices`)
    return Response.json(CONTRACTOR_INVOICE, { status: 201 });
  if (call.path === `${FINANCE}/party-openings`)
    return Response.json({
      id: "0199d300-0000-7000-8000-000000000009",
      party: { type: "contractor", id: CONTRACTOR_ID, name: null },
      place: { kind: "project", id: PROJECT_ID },
      asOfDate: "2026-04-01",
      amount: -2_500_00,
      updatedAt: "2026-10-08T06:30:00.000Z",
    });
  return undefined;
}

const meta = {
  title: "Finance/Parties/Party page",
  component: PartyMoneyPage,
  args: { projectId: PROJECT_ID, partyType: "supplier", partyId: SUPPLIER_ID },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(writes));
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl p-6">
        <PartyMoneyPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PartyMoneyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A Supplier's money: balance, opening, invoices with Overdue, Variance
 * and Settled, the invoice sheet with Settle invoice, payments and the
 * statement.
 */
export const SupplierInvoicesAndSettle: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Chennai Cements" }),
    ).toBeVisible();
    await expect(canvas.getByText("₹32,200.00")).toBeVisible();
    await expect(
      await canvas.findByText(/₹5,000.00 owed to the party as of 1 Apr 2026/),
    ).toBeVisible();
    const invoices = within(
      await canvas.findByRole("list", { name: "Invoices" }),
    );
    await expect(invoices.getByText("Overdue 10 days")).toBeVisible();
    await expect(invoices.getByText("Variance")).toBeVisible();
    await expect(invoices.getByText("Settled")).toBeVisible();

    await userEvent.click(
      invoices.getByRole("button", { name: PARTLY_PAID_INVOICE.invoiceNumber }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const sheet = within(await body.findByRole("dialog"));
    await expect(
      await sheet.findByText(
        /differs from the GRN value of ₹70,000.00 by ₹800.00/,
      ),
    ).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: /PAY\/26-27\/00004/ }),
    ).toBeVisible();
    await userEvent.click(
      sheet.getByRole("button", { name: "Settle invoice" }),
    );
    const settle = within(await body.findByRole("alertdialog"));
    await userEvent.click(
      settle.getByRole("button", { name: "Send for approval" }),
    );
    await expect(
      await settle.findByText("Say why the rest is written off"),
    ).toBeVisible();
    await expect(
      posted(`${FINANCE}/invoices/${PARTLY_PAID_INVOICE.id}/settle`),
    ).toHaveLength(0);
    await userEvent.type(settle.getByLabelText("Reason"), "Short supply");
    await userEvent.click(
      settle.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() =>
      expect(
        posted(`${FINANCE}/invoices/${PARTLY_PAID_INVOICE.id}/settle`),
      ).toEqual([{ reason: "Short supply" }]),
    );
  },
};

export const PaymentsAndStatement: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Invoices" });
    await userEvent.click(canvas.getByRole("tab", { name: "Payments" }));
    const payments = within(
      await canvas.findByRole("list", { name: "Payments" }),
    );
    await expect(
      payments.getByRole("link", { name: "PAY/26-27/00010" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/payments/suppliers/payments/0199d000-0000-7000-8000-000000000010`,
    );
    await expect(payments.getByText("+ TDS ₹500.00")).toBeVisible();
    await userEvent.click(canvas.getByRole("tab", { name: "Statement" }));
    const statement = within(
      await canvas.findByRole("list", { name: "Statement" }),
    );
    await expect(statement.getByText("Opening balance")).toBeVisible();
    await expect(statement.getByText("Balance ₹32,200.00")).toBeVisible();
  },
};

/** A Contractor with nothing yet: empty lists, Set opening and New invoice with a Department. */
export const ContractorEmptyThenInvoice: Story = {
  args: { partyType: "contractor", partyId: CONTRACTOR_ID },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(writes, { empty: true }));
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByText("No invoices yet")).toBeVisible();
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(
      await canvas.findByRole("button", { name: "Set opening" }),
    );
    const opening = within(await body.findByRole("dialog"));
    await userEvent.click(
      opening.getByRole("button", { name: "Advance with the party" }),
    );
    await userEvent.click(opening.getByRole("button", { name: "Save" }));
    await expect(await opening.findByText("Choose the date")).toBeVisible();
    await userEvent.type(opening.getByLabelText("As of"), "2026-04-01");
    await userEvent.type(opening.getByLabelText("Amount"), "2500");
    await userEvent.click(opening.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted(`${FINANCE}/party-openings`)).toEqual([
        {
          partyType: "contractor",
          partyId: CONTRACTOR_ID,
          projectId: PROJECT_ID,
          asOfDate: "2026-04-01",
          amount: -2_500_00,
          expectedUpdatedAt: null,
        },
      ]),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());

    await userEvent.click(canvas.getByRole("button", { name: "New invoice" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save invoice" }));
    await expect(
      await dialog.findByText("Enter the party's invoice number"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Invoice number"), "RA-4");
    await userEvent.click(dialog.getByRole("combobox", { name: "Department" }));
    await userEvent.click(await body.findByRole("option", { name: "RCC" }));
    await userEvent.type(dialog.getByLabelText("Taxable value"), "100000");
    await userEvent.type(dialog.getByLabelText("GST"), "18000");
    await userEvent.type(dialog.getByLabelText("Amount"), "100000");
    await userEvent.click(dialog.getByRole("button", { name: "Save invoice" }));
    await expect(
      await dialog.findByText(
        "Taxable value and GST cannot be more than the amount",
      ),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Amount"));
    await userEvent.type(dialog.getByLabelText("Amount"), "118000");
    await userEvent.click(dialog.getByRole("button", { name: "Save invoice" }));
    await waitFor(() =>
      expect(posted(`${FINANCE}/invoices`)[0]).toMatchObject({
        partyType: "contractor",
        partyId: CONTRACTOR_ID,
        invoiceNumber: "RA-4",
        departmentId: "0199a000-0000-7000-8000-0000000000e1",
        taxableAmount: 1_00_000_00,
        gstAmount: 18_000_00,
        amount: 1_18_000_00,
      }),
    );
  },
};

/** The server refuses a number the party already used: it shows on the field. */
export const InvoiceNumberTaken: Story = {
  args: { partyType: "contractor", partyId: CONTRACTOR_ID },
  beforeEach: () => {
    api = mockApi(
      partyMoneyHandler(
        (call) =>
          call.method === "POST" && call.path === `${FINANCE}/invoices`
            ? Response.json(
                {
                  code: "INVOICE_NUMBER_TAKEN",
                  message:
                    "This party already has an invoice with this number.",
                },
                { status: 409 },
              )
            : undefined,
        { empty: true },
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText("No invoices yet");
    await userEvent.click(
      await canvas.findByRole("button", { name: "New invoice" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Invoice number"), "RA-1");
    await userEvent.type(dialog.getByLabelText("Amount"), "5000");
    await userEvent.click(dialog.getByRole("button", { name: "Save invoice" }));
    await expect(
      await dialog.findByText(
        "This party already has an invoice with this number.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Invoice number")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

function clientHandler(call: ApiCall): Response | undefined {
  if (call.method !== "GET") return undefined;
  const path = call.path.split("?")[0] ?? "";
  if (path === `${FINANCE}/invoices`)
    return Response.json({
      items: [CLIENT_INVOICE],
      nextCursor: null,
      prevCursor: null,
      total: 1,
    });
  if (path === `${FINANCE}/party-statements`)
    return Response.json({
      ...SUPPLIER_STATEMENT,
      party: {
        type: "client",
        id: CLIENT_ID,
        name: "Tamil Nadu Housing Board",
      },
      lines: [],
      closing: -CLIENT_INVOICE.amount,
      openInvoices: [CLIENT_INVOICE],
    });
  return undefined;
}

/**
 * A Client (CM-1107): due, retention, TDS and GST-TDS receivable; its
 * invoices come from Client Bills (read-only, linked back), so it only
 * receives payments.
 */
export const ClientReceivablesAndBillInvoice: Story = {
  args: { partyType: "client", partyId: CLIENT_ID },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(clientHandler));
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const figures = within(
      await canvas.findByRole("region", { name: "Client receivables" }),
    );
    await expect(figures.getByText("₹6,89,932.04")).toBeVisible();
    await expect(figures.getByText("₹61,055.93")).toBeVisible();
    await expect(figures.getAllByText("₹13,798.64")).toHaveLength(2);
    await expect(canvas.getByText("owed by the Client")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "New invoice" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Receive payment" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/payments/clients/pay?partyId=${CLIENT_ID}&direction=in`,
    );
    await userEvent.click(
      await canvas.findByRole("button", {
        name: `${CLIENT_INVOICE.invoiceNumber} (Client Bill)`,
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const sheet = within(await body.findByRole("dialog"));
    await expect(await sheet.findByText(/From Client Bill/)).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: CLIENT_INVOICE.invoiceNumber }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/client-bills/${CLIENT_BILL_ID}`,
    );
    await expect(sheet.queryByRole("button", { name: "Edit" })).toBeNull();
  },
};
