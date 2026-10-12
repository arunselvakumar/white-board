import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { chooseFromMenu } from "@/components/masters/masters-story-support";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { companyAccountsHandler, financeAccess } from "./account-list-fixtures";
import { BankAccountsList } from "./bank-accounts-list";

function serve(options: Parameters<typeof companyAccountsHandler>[0] = {}) {
  return () => mockApi(companyAccountsHandler(options)).restore;
}

function rowOf(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByRole("link", { name }) != null);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

const meta = {
  title: "Finance/Company's Bank A/C/List",
  component: BankAccountsList,
  parameters: { layout: "fullscreen" },
  render: () => (
    <StoryQueries>
      <BankAccountsList />
    </StoryQueries>
  ),
} satisfies Meta<typeof BankAccountsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Accounts with masked numbers, the primary badge, a negative balance and pending documents. */
export const WithAccounts: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "Company accounts" });
    const cash = within(rowOf(list, "Company's Cash Account"));
    await expect(cash.getByText("Primary")).toBeVisible();
    await expect(cash.getByText("-₹12,500.00")).toHaveClass("text-destructive");
    const hdfc = within(rowOf(list, "HDFC Current A/c"));
    await expect(
      hdfc.getByText("HDFC Bank · ••••6789 · HDFC0001234 · Anna Nagar"),
    ).toBeVisible();
    await expect(hdfc.getByText("2 pending (−₹37,650.00)")).toBeVisible();
    await expect(hdfc.queryByText("50100123456789")).toBeNull();
    await expect(
      await canvas.findByRole("button", { name: "Add account" }),
    ).toBeVisible();
  },
};

/** Set As Primary moves the badge; the primary offers neither Set As Primary nor Delete. */
export const SetAsPrimary: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Company accounts" });
    await chooseFromMenu(
      canvasElement,
      userEvent,
      "HDFC Current A/c",
      "Set As Primary",
    );
    await waitFor(() =>
      expect(
        within(rowOf(list, "HDFC Current A/c")).getByText("Primary"),
      ).toBeVisible(),
    );
    await expect(
      within(rowOf(list, "Company's Cash Account")).queryByText("Primary"),
    ).toBeNull();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for HDFC Current A/c" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "View Ledger" }),
    ).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await expect(
      body.queryByRole("menuitem", { name: "Set As Primary" }),
    ).toBeNull();
  },
};

/** Deleting an account money moved through shows the server's refusal. */
export const DeleteRefused: Story = {
  beforeEach: serve({ inUse: ["SBI Savings"] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Company accounts" });
    await chooseFromMenu(canvasElement, userEvent, "SBI Savings", "Delete");
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete SBI Savings?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(
      await confirm.findByText(
        "Money has moved through this account, so it cannot be deleted.",
      ),
    ).toBeVisible();
  },
};

/** No accounts: the empty state offers Add account. */
export const Empty: Story = {
  beforeEach: serve({ initial: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No accounts yet")).toBeVisible();
    await expect(
      (await canvas.findAllByRole("button", { name: "Add account" })).length,
    ).toBeGreaterThan(0);
  },
};

/** Read only: no Add, and the row menu only offers the Ledger. */
export const ReadOnly: Story = {
  beforeEach: serve({ access: financeAccess(["read"]) }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Company accounts" });
    await waitFor(() =>
      expect(canvas.queryByRole("button", { name: "Add account" })).toBeNull(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for SBI Savings" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("menuitem", { name: "View Ledger" }),
    ).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Edit" })).toBeNull();
  },
};
