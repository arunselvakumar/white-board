import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { ImportTransactionsDialog } from "./import-transactions-dialog";
import { PROJECT_ID, transactionsHandler } from "./transaction-fixtures";

const meta = {
  title: "Finance/Transactions/Import",
  component: ImportTransactionsDialog,
  args: { projectId: PROJECT_ID, open: true, onClose: fn() },
  render: (args) => (
    <StoryQueries>
      <ImportTransactionsDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ImportTransactionsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const file = () =>
  new File(["xlsx"], "transactions.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

/** Any problem imports nothing; each one is listed by row and column. */
export const RowErrors: Story = {
  beforeEach: () =>
    mockApi(
      transactionsHandler({
        importErrors: [
          { row: 3, field: "Account", message: "No account is named “Axis”." },
          {
            row: 4,
            field: "Amount (₹)",
            message: "Enter the amount in rupees, like 1500.50.",
          },
        ],
      }),
    ).restore,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await page.findByRole("dialog", { name: "Import Transactions" }),
    );
    await expect(
      dialog.getByRole("link", { name: "Download sample" }),
    ).toHaveAttribute(
      "href",
      `/api/construction/finance/transactions/import-sample?projectId=${PROJECT_ID}`,
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), file());
    const problems = within(
      await dialog.findByRole("list", { name: "Problems in the sheet" }),
    );
    await expect(problems.getByText("Row 3")).toBeVisible();
    await expect(
      problems.getByText(/No account is named “Axis”/),
    ).toBeVisible();
    await expect(
      dialog.getByText("2 problems; nothing was imported."),
    ).toBeVisible();
  },
};

/** A clean sheet: every row is imported as pending. */
export const Imported: Story = {
  beforeEach: () => mockApi(transactionsHandler()).restore,
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await page.findByRole("dialog", { name: "Import Transactions" }),
    );
    await userEvent.upload(dialog.getByLabelText("Choose Excel file"), file());
    await expect(await dialog.findByRole("status")).toHaveTextContent(
      "3 Transactions imported, waiting for approval.",
    );
  },
};
