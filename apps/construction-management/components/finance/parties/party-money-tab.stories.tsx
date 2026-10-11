import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import {
  AWAITING_GRNS,
  OVERDUE_INVOICE,
  partyMoneyHandler,
  PROJECT_ID,
  READ_ONLY_ACCESS,
  TODAY,
} from "./party-fixtures";
import { PartyMoneyTab } from "./party-money-tab";

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown {
  return api.calls.mock.calls.find(
    ([call]) => call.method === "POST" && call.path === path,
  )?.[0].body;
}

const meta = {
  title: "Finance/Parties/Tab",
  component: PartyMoneyTab,
  args: { projectId: PROJECT_ID, partyType: "contractor", today: TODAY },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler());
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl p-6">
        <PartyMoneyTab {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PartyMoneyTab>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Balances per Contractor, Pay per row, and the TDS ledger tab. */
export const ContractorBalancesAndTds: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Cards on a phone-width canvas, a table on wider screens.
    const table = within(
      await canvas.findByRole("list", { name: "Contractor balances" }),
    );
    await expect(
      table.getByRole("link", { name: "Sri Murugan Builders" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/payments/contractors/0199a000-0000-7000-8000-0000000000d1`,
    );
    await expect(table.getByText("Not on Project")).toBeVisible();
    await expect(table.getByText("₹73,000.00")).toBeVisible();
    await expect(
      table.getByRole("link", { name: "Pay Sri Murugan Builders" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "TDS" }));
    await expect(
      await canvas.findByText(
        "Choose a Contractor to see the TDS deducted from their payments.",
      ),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Contractor" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Sri Murugan Builders",
      }),
    );
    const quarters = within(
      await canvas.findByRole("list", { name: "Quarter totals" }),
    );
    await expect(quarters.getAllByRole("listitem")).toHaveLength(4);
    await expect(quarters.getByText("Q3 (Oct–Dec)")).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "TDS ledger" })).getByText(
        "PAY/26-27/00010",
      ),
    ).toBeVisible();
  },
};

/**
 * GRNs awaiting an invoice: two of one Supplier become one invoice whose
 * amount starts at their total value.
 */
export const SupplierInvoiceFromGrns: Story = {
  args: { partyType: "supplier" },
  beforeEach: () => {
    api = mockApi(
      partyMoneyHandler((call) =>
        call.method === "POST" &&
        call.path === "/api/construction/finance/invoices"
          ? Response.json(OVERDUE_INVOICE, { status: 201 })
          : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grns = within(
      await canvas.findByRole("list", { name: "GRNs awaiting invoice" }),
    );
    const [first, second, third] = AWAITING_GRNS;
    await userEvent.click(
      grns.getByRole("checkbox", { name: new RegExp(first?.number ?? "") }),
    );
    await userEvent.click(
      grns.getByRole("checkbox", { name: new RegExp(third?.number ?? "") }),
    );
    await expect(
      await canvas.findByText("Choose GRNs of one Supplier."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Create invoice" }),
    ).toBeDisabled();
    await userEvent.click(
      grns.getByRole("checkbox", { name: new RegExp(third?.number ?? "") }),
    );
    await userEvent.click(
      grns.getByRole("checkbox", { name: new RegExp(second?.number ?? "") }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create invoice" }),
    );

    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(
      dialog.getByRole("list", { name: "Goods Receipts on this invoice" }),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Amount")).toHaveValue("35400");
    await userEvent.type(dialog.getByLabelText("Invoice number"), "CC/OCT");
    await userEvent.click(dialog.getByRole("button", { name: "Save invoice" }));
    await waitFor(() =>
      expect(posted("/api/construction/finance/invoices")).toMatchObject({
        partyType: "supplier",
        partyId: first?.supplier.id,
        projectId: PROJECT_ID,
        invoiceNumber: "CC/OCT",
        amount: 35_400_00,
        goodsReceiptIds: [first?.id, second?.id],
      }),
    );
  },
};

export const NoPartiesYet: Story = {
  args: { partyType: "supplier" },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(undefined, { empty: true }));
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Suppliers on this Project"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("list", { name: "GRNs awaiting invoice" }),
    ).toBeNull();
  },
};

/** Read only: balances show; New invoice, Record payment and Pay do not. */
export const ReadOnly: Story = {
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(undefined, { access: READ_ONLY_ACCESS }));
    return api.restore;
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Contractor balances" });
    await waitFor(() =>
      expect(
        api.calls.mock.calls.some(([call]) =>
          call.path.startsWith("/api/construction/finance/access"),
        ),
      ).toBe(true),
    );
    await expect(
      canvas.queryByRole("button", { name: "New invoice" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Record payment" }),
    ).toBeNull();
    await expect(canvas.queryByRole("link", { name: /^Pay / })).toBeNull();
  },
};
