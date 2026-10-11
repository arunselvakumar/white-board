import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { AccountDialog } from "./account-dialog";
import {
  COMPANY_ACCOUNTS,
  companyAccountsHandler,
  STORY_TODAY,
} from "./account-list-fixtures";

let api: ReturnType<typeof mockApi>;

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Finance/Company's Bank A/C/Account dialog",
  component: AccountDialog,
  args: { account: null, onClose: fn(), today: STORY_TODAY },
  beforeEach: () => {
    api = mockApi(companyAccountsHandler());
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <AccountDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof AccountDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function dialog(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Name required; a malformed IFSC is caught before saving. */
export const Validation: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    await body.findByRole("dialog", { name: "Add account" });
    await userEvent.type(body.getByLabelText("IFSC"), "hdfc1234");
    await userEvent.click(body.getByRole("button", { name: "Add account" }));
    await expect(await body.findByText("Enter the account name")).toBeVisible();
    await expect(
      body.getByText(
        "Four letters, a zero, then six letters or digits (like HDFC0001234)",
      ),
    ).toBeVisible();
    await expect(posted()).toHaveLength(0);
  },
};

/** The server's IFSC refusal shows under the field. */
export const IfscRefused: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    await body.findByRole("dialog", { name: "Add account" });
    await userEvent.type(body.getByLabelText("Account name"), "HDFC Escrow");
    await userEvent.type(body.getByLabelText("IFSC"), "hdfc0000000");
    await userEvent.click(body.getByRole("button", { name: "Add account" }));
    await expect(
      await body.findByText(
        "An IFSC is four letters, a zero, then six letters or digits (like HDFC0001234).",
      ),
    ).toBeVisible();
    await expect(posted()[0]?.body).toMatchObject({ ifsc: "HDFC0000000" });
  },
};

/** A Cash account has no bank fields; the opening balance may be negative. */
export const CashAccount: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    await body.findByRole("dialog", { name: "Add account" });
    await userEvent.click(body.getByRole("button", { name: "Cash Account" }));
    await expect(body.queryByLabelText("IFSC")).toBeNull();
    await userEvent.type(body.getByLabelText("Account name"), "Site cash");
    const opening = body.getByLabelText("Opening balance");
    await userEvent.click(opening);
    await userEvent.keyboard("-1500.50");
    await userEvent.click(body.getByRole("button", { name: "Add account" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted()[0]?.body).toMatchObject({
      kind: "cash",
      name: "Site cash",
      bankName: null,
      openingBalance: -1_500_50,
      openingDate: STORY_TODAY,
    });
  },
};

/** Editing keeps the kind and sends the last-seen `updatedAt`. */
export const Edit: Story = {
  args: { account: COMPANY_ACCOUNTS[1] ?? null },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    await body.findByRole("dialog", { name: "Edit HDFC Current A/c" });
    await expect(
      body.getByRole("button", { name: "Bank Account" }),
    ).toBeDisabled();
    const name = body.getByLabelText("Account name");
    await userEvent.clear(name);
    await userEvent.type(name, "HDFC Main");
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted()[0]?.path).toContain("/update");
    await expect(posted()[0]?.body).toMatchObject({
      name: "HDFC Main",
      openingBalance: 5_00_000_00,
      expectedUpdatedAt: COMPANY_ACCOUNTS[1]?.updatedAt,
    });
  },
};
