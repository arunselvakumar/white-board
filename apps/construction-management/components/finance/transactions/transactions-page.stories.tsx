import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { financeAccess } from "@/components/finance/accounts/account-list-fixtures";

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
import { TransactionsPage } from "./transactions-page";

let api: ReturnType<typeof mockApi>;

function serve(options: Parameters<typeof transactionsHandler>[0] = {}) {
  return () => {
    api = mockApi(transactionsHandler(options));
    return api.restore;
  };
}

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.startsWith(path));
}

/** Whichever of the table (wide) or the cards (phone) is showing. */
function shown(
  canvas: { getAllByText: (text: string | RegExp) => HTMLElement[] },
  text: string | RegExp,
) {
  return canvas.getAllByText(text).filter((node) => node.checkVisibility());
}

const meta = {
  title: "Finance/Transactions/Register",
  component: TransactionsPage,
  parameters: { layout: "fullscreen" },
  args: { projectId: PROJECT_ID, today: STORY_TODAY },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <div className="p-4">
        <TransactionsPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof TransactionsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Transactions and a transfer with chips and the totals of what is listed. */
export const List: Story = {
  play: async ({ canvas }) => {
    await canvas.findByText("4 entries · totals leave out rejected ones");
    const totals = within(canvas.getByRole("region", { name: "Totals" }));
    await expect(totals.getByText("₹1,00,000.00")).toBeVisible();
    await expect(totals.getByText("₹25,000.00")).toBeVisible();
    await expect(totals.getByText("₹75,000.00")).toBeVisible();
    await expect(totals.getByText("₹10,000.00")).toBeVisible();
    await expect(shown(canvas, "TXN/26-27/00001")).not.toHaveLength(0);
    await expect(shown(canvas, "Rejected")).not.toHaveLength(0);
    await expect(shown(canvas, "Approved")).not.toHaveLength(0);
    await expect(shown(canvas, /Company's Bank|HDFC Current/)).not.toHaveLength(
      0,
    );
    await expect(
      await canvas.findByRole("button", { name: "New transaction" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Transfer" }),
    ).toBeVisible();
  },
};

/** The type filter asks the server again. */
export const FilterByType: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText(/4 entries/);
    await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
    const list = within(
      await within(canvasElement.ownerDocument.body).findByRole("listbox"),
    );
    await userEvent.click(list.getByRole("option", { name: "Transfer" }));
    await expect(await canvas.findByText(/^1 entry/)).toBeVisible();
    await expect(
      calls("GET", "/api/construction/finance/transactions?").some((call) =>
        call.path.includes("type=transfer"),
      ),
    ).toBe(true);
  },
};

/** Bulk reject asks for a reason and decides the selected pending ones. */
export const BulkReject: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText(/4 entries/);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    const boxes = canvas
      .getAllByRole("checkbox", { name: "Select TXN/26-27/00001" })
      .filter((node) => node.checkVisibility());
    const [first] = boxes;
    if (first == null) throw new Error("No checkbox");
    await userEvent.click(first);
    const transfer = canvas
      .getAllByRole("checkbox", { name: "Select TXN/26-27/00004" })
      .filter((node) => node.checkVisibility());
    const [second] = transfer;
    if (second == null) throw new Error("No checkbox");
    await userEvent.click(second);
    await userEvent.click(canvas.getByRole("button", { name: "Reject (2)" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Duplicate entries");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 rejected.",
    );
    await expect(
      calls("POST", "/api/construction/finance/transactions/bulk")[0]?.body,
    ).toEqual({
      approve: false,
      reason: "Duplicate entries",
      items: [
        { type: "transfer", id: "0199a000-0000-7000-8000-000000001101" },
        { type: "transaction", id: "0199a000-0000-7000-8000-000000001001" },
      ],
    });
  },
};

/** Nothing recorded yet: the empty state offers New transaction. */
export const Empty: Story = {
  beforeEach: serve({ initial: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Transactions yet")).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.getAllByRole("button", { name: "New transaction" }).length,
      ).toBe(2),
    );
  },
};

/** Read only: no New transaction, Transfer, Import or Bulk approval. */
export const ReadOnly: Story = {
  beforeEach: serve({ access: financeAccess(["read"], PROJECT_ID) }),
  play: async ({ canvas }) => {
    await canvas.findByText(/4 entries/);
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "New transaction" }),
      ).toBeNull(),
    );
    await expect(
      canvas.queryByRole("button", { name: "Bulk approval" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Import" })).toBeNull();
  },
};
