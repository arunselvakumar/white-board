import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  PROJECT_ID,
  STORY_TODAY,
  transactionsHandler,
} from "./transaction-fixtures";
import { TransferDialog } from "./transfer-form";

let api: ReturnType<typeof mockApi>;

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Finance/Transactions/Transfer form",
  component: TransferDialog,
  args: {
    projectId: PROJECT_ID,
    transfer: null,
    canApprove: true,
    onClose: fn(),
    today: STORY_TODAY,
  },
  beforeEach: () => {
    api = mockApi(transactionsHandler());
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <TransferDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TransferDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** UPI from the bank to a petty-cash holder needs a reference and a destination. */
export const Validation: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole("dialog", { name: "Transfer" });
    await userEvent.click(page.getByRole("button", { name: "UPI" }));
    // Required account pickers tell screen readers so, past their wrappers.
    for (const name of ["From account", "To account"])
      await expect(page.getByRole("combobox", { name })).toHaveAttribute(
        "aria-required",
        "true",
      );
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect(
      await page.findByText("Enter the transaction reference"),
    ).toBeVisible();
    await expect(
      page.getByText("Choose the account the money goes to"),
    ).toBeVisible();
    await expect(posted()).toHaveLength(0);
  },
};

/** Funding a holder's petty cash from the bank by UPI. */
export const FundPettyCash: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole("dialog", { name: "Transfer" });
    await userEvent.click(page.getByRole("button", { name: "UPI" }));
    await userEvent.click(page.getByRole("combobox", { name: "To account" }));
    const list = within(await page.findByRole("listbox"));
    await userEvent.click(
      list.getByRole("option", { name: "My petty cash (Ravi Kumar)" }),
    );
    await userEvent.type(page.getByLabelText("Reference"), "UPI-2201");
    await userEvent.type(page.getByLabelText("Amount"), "10000");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted()[0]?.body).toMatchObject({
      projectId: PROJECT_ID,
      mode: "upi",
      fromAccountId: "0199a000-0000-7000-8000-000000000002",
      toAccountId: "0199a000-0000-7000-8000-000000000003",
      reference: "UPI-2201",
      amount: 10_000_00,
      approve: false,
    });
  },
};
