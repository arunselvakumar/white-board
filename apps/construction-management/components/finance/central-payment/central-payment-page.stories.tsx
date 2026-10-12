import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { CentralPaymentPage } from "./central-payment-page";
import {
  BANK_ID,
  centralPaymentHandler,
  EMPTY_SUMMARY,
  MEMBER_SUMMARY,
  REPORTS_API,
  TODAY,
} from "./central-payment-fixtures";

let api: ReturnType<typeof mockApi>;

const meta = {
  title: "Finance/Central Payment",
  component: CentralPaymentPage,
  args: { today: TODAY },
  beforeEach: () => {
    api = mockApi(centralPaymentHandler());
    return api.restore;
  },
  parameters: {
    nextjs: { navigation: { pathname: "/app/workspace/central-payment" } },
  },
  render: (args) => (
    <StoryQueries>
      <CentralPaymentPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof CentralPaymentPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Owner: every Project's dues, the accounts, petty cash and the reports. */
export const Owner: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Central Payment" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/across every Project \(3\) and Store/),
    ).toBeVisible();
    const contractors = within(
      canvas.getByRole("table", { name: "Contractor dues" }),
    );
    await expect(
      contractors.getByRole("rowheader", { name: /Velan Constructions/ }),
    ).toBeVisible();
    await expect(contractors.getAllByText("₹12,80,000.00")[0]).toBeVisible();
    // Overdue is its own column on wide screens and under the name on phones.
    await expect(
      contractors.getAllByText("₹4,15,000.00")[0],
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("tab", { name: /Other Parties/ }));
    const others = within(
      await canvas.findByRole("table", { name: "Other Party dues" }),
    );
    await expect(
      others.getByText("Receivable", { selector: "th" }),
    ).toBeInTheDocument();
    await expect(others.getAllByText("₹5,00,000.00")[0]).toBeInTheDocument();

    const accounts = within(
      canvas.getByRole("list", { name: "Company accounts" }),
    );
    await expect(accounts.getByText("Primary")).toBeVisible();
    await expect(accounts.getByText("-₹2,40,000.00")).toHaveClass(
      "text-destructive",
    );
    await expect(
      accounts.getByText("2 pending documents: -₹12,000.00"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Company's Bank A/C" }),
    ).toHaveAttribute("href", "/app/masters/bank-accounts");
    const petty = within(
      canvas.getByRole("list", { name: "Petty-cash accounts" }),
    );
    await expect(petty.getByText("Ravi Kumar")).toBeVisible();
    await expect(petty.getByText("Pending -₹1,200.00")).toBeVisible();
    for (const name of ["Ledger", "TDS 194C", "Due Payments"])
      await expect(canvas.getByRole("form", { name })).toBeVisible();
    await expect(await canvas.findByText("No reports yet")).toBeVisible();
  },
};

/** Ledger on an account starts the Ledger report on it, and Generate sends it. */
export const LedgerFromAccount: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Company accounts" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Ledger of Company's Bank Account" }),
    );
    const card = within(canvas.getByRole("form", { name: "Ledger" }));
    await waitFor(() =>
      expect(card.getByRole("combobox", { name: "Account" })).toHaveTextContent(
        "Company's Bank Account",
      ),
    );
    // The legacy filters: module, mode and Paid To kind.
    await userEvent.click(card.getByRole("combobox", { name: "Module" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Party Payment",
      }),
    );
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await expect(await card.findByText("Ready to download")).toBeVisible();
    const posted = api.calls.mock.calls
      .map(([call]) => call)
      .find((call) => call.method === "POST" && call.path === REPORTS_API);
    await expect(posted?.body).toEqual({
      kind: "account_ledger",
      projectId: null,
      params: {
        from: "2026-10-01",
        to: TODAY,
        accountId: BANK_ID,
        module: "party_payment",
      },
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Ledger of Petty cash — Ravi Kumar" }),
    );
    await waitFor(() =>
      expect(
        within(canvas.getByRole("form", { name: "Ledger" })).getByRole(
          "combobox",
          { name: "Account" },
        ),
      ).toHaveTextContent("Petty cash — Ravi Kumar (Ravi Kumar)"),
    );
  },
};

/** A member on one Project with Central payment Read only. */
export const MemberOnOneProject: Story = {
  beforeEach: () => {
    api = mockApi(centralPaymentHandler(MEMBER_SUMMARY));
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/across the 1 Project you are on/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Accounts" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("heading", { name: "Petty cash" }),
    ).toBeNull();
    await expect(canvas.queryByRole("form", { name: "Ledger" })).toBeNull();
    await expect(canvas.queryByRole("heading", { name: "Reports" })).toBeNull();
  },
};

/** A new Company: nothing owed and no accounts or petty cash yet. */
export const Empty: Story = {
  beforeEach: () => {
    api = mockApi(centralPaymentHandler(EMPTY_SUMMARY));
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No Contractor has invoices, payments or a balance on these Projects.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText("There are no company accounts yet."),
    ).toBeVisible();
    await expect(
      canvas.getByText("There is no petty-cash account you can see."),
    ).toBeVisible();
    // With no account to pick, the Ledger cannot be generated.
    const ledger = within(canvas.getByRole("form", { name: "Ledger" }));
    await expect(
      ledger.getByRole("button", { name: "Generate" }),
    ).toBeDisabled();
  },
};

/** At phone width nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("table", { name: "Contractor dues" });
    await canvas.findByRole("list", { name: "Company accounts" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
