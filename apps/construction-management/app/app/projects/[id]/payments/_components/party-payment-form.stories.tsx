import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { ACCOUNT_OPTIONS } from "@/components/finance/account-fixtures";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  CONTRACTOR_ID,
  OTHER_PARTY_ID,
  CONTRACTOR_PAYMENT,
  OVERDUE_INVOICE,
  PARTLY_PAID_INVOICE,
  partyMoneyHandler,
  PROJECT_ID,
  SALES_INVOICE,
  suggestionFor,
  SUPPLIER_ID,
  TODAY,
} from "./party-fixtures";
import { PartyPaymentScreen } from "./party-payment-form";

const PAYMENTS = "/api/construction/finance/party-payments";
const BANK = ACCOUNT_OPTIONS[1];

let api: ReturnType<typeof mockApi>;

function recorded(): unknown[] {
  return api.calls.mock.calls
    .filter(([call]) => call.method === "POST" && call.path === PAYMENTS)
    .map(([call]) => call.body);
}

function writes(call: ApiCall): Response | undefined {
  if (call.method !== "POST") return undefined;
  if (call.path === `${PAYMENTS}/tds-suggestion`)
    return Response.json(
      suggestionFor((call.body as { settled: number }).settled),
    );
  if (call.path === PAYMENTS)
    return Response.json(CONTRACTOR_PAYMENT, { status: 201 });
  return undefined;
}

const meta = {
  title: "Finance/Parties/Record payment",
  component: PartyPaymentScreen,
  args: {
    projectId: PROJECT_ID,
    partyType: "supplier",
    partyId: SUPPLIER_ID,
    today: TODAY,
  },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(writes));
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <PartyPaymentScreen {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PartyPaymentScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Fill spreads the amount over open invoices, oldest due first; UPI needs a reference. */
export const SupplierPaymentFillsOldestFirst: Story = {
  play: async ({ canvas, userEvent }) => {
    const invoices = within(
      await canvas.findByRole("list", { name: "Open invoices" }),
    );
    await userEvent.type(canvas.getByLabelText("Amount"), "50000");
    await userEvent.click(canvas.getByRole("button", { name: "Fill" }));
    await expect(
      invoices.getByLabelText(OVERDUE_INVOICE.invoiceNumber),
    ).toHaveValue("47200");
    await expect(
      invoices.getByLabelText(PARTLY_PAID_INVOICE.invoiceNumber),
    ).toHaveValue("2800");
    await expect(canvas.getByText(/advance/)).toHaveTextContent("₹0.00");

    await userEvent.click(canvas.getByRole("button", { name: "UPI" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Record ₹50,000.00" }),
    );
    await expect(
      await canvas.findByText("Enter the transaction reference"),
    ).toBeVisible();
    await expect(recorded()).toHaveLength(0);
    await userEvent.type(canvas.getByLabelText("Reference"), "UPI-55120");
    await userEvent.click(
      canvas.getByRole("button", { name: "Record ₹50,000.00" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${PROJECT_ID}/payments/suppliers/payments/${CONTRACTOR_PAYMENT.id}`,
      ),
    );
    await expect(recorded()[0]).toMatchObject({
      partyType: "supplier",
      partyId: SUPPLIER_ID,
      projectId: PROJECT_ID,
      direction: "out",
      paymentDate: TODAY,
      mode: "upi",
      accountId: BANK?.id,
      reference: "UPI-55120",
      amount: 50_000_00,
      allocations: [
        { invoiceId: OVERDUE_INVOICE.id, amount: 47_200_00 },
        { invoiceId: PARTLY_PAID_INVOICE.id, amount: 2_800_00 },
      ],
      confirmDuplicateReference: false,
    });
  },
};

/** The TDS suggestion decides what is paid; changing it needs a reason (CM-706). */
export const ContractorTdsOverride: Story = {
  args: { partyType: "contractor", partyId: CONTRACTOR_ID },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Open invoices" });
    await userEvent.type(
      canvas.getByLabelText("Amount settled (paid + TDS)"),
      "50000",
    );
    await expect(
      await canvas.findByText(/Suggested ₹500.00 at 1.00% on ₹50,000.00/),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("button", { name: "Record ₹49,500.00" }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Change the TDS" }),
    );
    const tds = canvas.getByLabelText("TDS amount");
    await expect(tds).toHaveValue("500");
    await userEvent.clear(tds);
    await userEvent.type(tds, "250");
    await userEvent.click(
      canvas.getByRole("button", { name: "Record ₹49,750.00" }),
    );
    await expect(
      await canvas.findByText("Say why the TDS differs from the suggestion"),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Reason for the change"),
      "Section 197 certificate",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Record ₹49,750.00" }),
    );
    await waitFor(() => expect(recorded()).toHaveLength(1));
    await expect(recorded()[0]).toMatchObject({
      partyType: "contractor",
      amount: 49_750_00,
      tdsAmount: 250_00,
      tdsRate: "1.00",
      tdsOverrideReason: "Section 197 certificate",
    });
  },
};

/** A reference already used on the account: the form offers Save anyway. */
export const DuplicateReferenceSaveAnyway: Story = {
  beforeEach: () => {
    let first = true;
    api = mockApi(
      partyMoneyHandler((call) => {
        if (call.method === "POST" && call.path === PAYMENTS && first) {
          first = false;
          return Response.json(
            {
              code: "DUPLICATE_REFERENCE",
              message:
                "This reference is already used on HDFC Current A/c (PAY/26-27/00004). Check it, or save anyway.",
              details: { field: "reference" },
            },
            { status: 409 },
          );
        }
        return writes(call);
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Open invoices" });
    await userEvent.type(canvas.getByLabelText("Amount"), "1000");
    await userEvent.click(canvas.getByRole("button", { name: "Online" }));
    await userEvent.type(canvas.getByLabelText("Reference"), "UTR-1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Record ₹1,000.00" }),
    );
    await expect(
      await canvas.findByText(/already used on HDFC Current A\/c/),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(recorded()).toHaveLength(2));
    await expect(recorded()[1]).toMatchObject({
      confirmDuplicateReference: true,
      allocations: [],
    });
  },
};

/** No open invoices: the whole payment is an advance; a refusal shows on the form. */
export const AdvanceAndRefusal: Story = {
  args: { partyType: "contractor", partyId: CONTRACTOR_ID },
  beforeEach: () => {
    api = mockApi(
      partyMoneyHandler(
        (call) =>
          call.method === "POST" && call.path === PAYMENTS
            ? Response.json(
                {
                  code: "FINANCIAL_PERIOD_CLOSED",
                  message:
                    "The books are closed up to 2026-09-30. Entries dated on or before it cannot be created.",
                },
                { status: 403 },
              )
            : writes(call),
        { empty: true },
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        /No open invoices. The whole payment is an advance/,
      ),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText("Amount settled (paid + TDS)"),
      "20000",
    );
    const record = await canvas.findByRole("button", {
      name: "Record ₹20,000.00",
    });
    // Enabled once the TDS suggestion for the amount is in.
    await waitFor(() => expect(record).toBeEnabled());
    await expect(canvas.getByText(/Below ₹30,000/)).toBeVisible();
    await userEvent.click(record);
    await expect(
      await canvas.findByText(/The books are closed up to 2026-09-30/),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

/** Payment In from an Other Party settles its sales invoices (CM-708). */
export const OtherPartyPaymentIn: Story = {
  args: {
    partyType: "other_party",
    partyId: OTHER_PARTY_ID,
    direction: "in",
  },
  play: async ({ canvas, userEvent }) => {
    const invoices = within(
      await canvas.findByRole("list", { name: "Open invoices" }),
    );
    await expect(invoices.getByText(SALES_INVOICE.invoiceNumber)).toBeVisible();
    await expect(canvas.getByText("Received into")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Amount"), "30000");
    await userEvent.click(canvas.getByRole("button", { name: "Fill" }));
    await expect(canvas.getByText(/advance/)).toHaveTextContent("₹5,000.00");
    await userEvent.click(
      canvas.getByRole("button", { name: "Record ₹30,000.00" }),
    );
    await waitFor(() => expect(recorded()).toHaveLength(1));
    await expect(recorded()[0]).toMatchObject({
      partyType: "other_party",
      direction: "in",
      amount: 30_000_00,
      allocations: [{ invoiceId: SALES_INVOICE.id, amount: 25_000_00 }],
    });
  },
};
