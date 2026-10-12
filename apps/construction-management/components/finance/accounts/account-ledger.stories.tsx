import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { AccountLedger } from "./account-ledger";
import { BANK_ID, STATEMENT, statementHandler } from "./account-list-fixtures";

const meta = {
  title: "Finance/Company's Bank A/C/Ledger",
  component: AccountLedger,
  parameters: { layout: "fullscreen" },
  args: {
    accountId: BANK_ID,
    back: { label: "Company's Bank A/C", href: "/app/masters/bank-accounts" },
  },
  beforeEach: () => mockApi((call) => statementHandler(call)).restore,
  render: (args) => (
    <StoryQueries>
      <AccountLedger {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof AccountLedger>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening, each entry with its running balance, credit / debit, closing. */
export const Statement: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "HDFC Current A/c — Ledger" }),
    ).toBeVisible();
    const summary = within(canvas.getByRole("region", { name: "Summary" }));
    await expect(summary.getByText("₹5,00,000.00")).toBeVisible();
    await expect(summary.getByText("₹37,650.00")).toBeVisible();
    await expect(summary.getByText("₹4,62,350.00")).toBeVisible();
    // The table on wide screens, cards on phones: whichever shows.
    const shown = (text: string | RegExp) =>
      canvas.getAllByText(text).filter((node) => node.checkVisibility());
    await expect(
      shown("TXN/26-27/00004 · Sri Murugan Builders"),
    ).not.toHaveLength(0);
    await expect(shown(/Cheque · 000123/)).not.toHaveLength(0);
    await expect(shown("₹4,75,000.00")).not.toHaveLength(0);
  },
};

/** A period with nothing in it says so. */
export const EmptyPeriod: Story = {
  beforeEach: () =>
    mockApi((call) => statementHandler(call, { ...STATEMENT, entries: [] }))
      .restore,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Nothing moved through this account/),
    ).toBeVisible();
  },
};
