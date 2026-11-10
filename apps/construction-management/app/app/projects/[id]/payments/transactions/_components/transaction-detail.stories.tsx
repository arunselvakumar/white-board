import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { mockFinanceDocumentApi } from "@/components/finance/documents/finance-document-fixtures";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { TransactionDetail } from "./transaction-detail";
import {
  PENDING_OUT,
  PENDING_TRANSFER,
  PROJECT_ID,
  REJECTED_OUT,
  STORY_TODAY,
  transactionsHandler,
} from "./transaction-fixtures";

const meta = {
  title: "Finance/Transactions/Detail",
  component: TransactionDetail,
  parameters: { layout: "fullscreen" },
  args: {
    projectId: PROJECT_ID,
    document: "transaction",
    id: PENDING_OUT.id,
    today: STORY_TODAY,
  },
  beforeEach: () => {
    const register = transactionsHandler();
    const documents = mockFinanceDocumentApi();
    return mockApi((call) => documents(call) ?? register(call)).restore;
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-4">
        <TransactionDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof TransactionDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pending cheque payment: Approve turns it Approved. */
export const PendingApprove: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "TXN/26-27/00001" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Cheque · Cheque 000123 dated 1 Oct 2026"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Sri Murugan Builders (Contractor)"),
    ).toBeVisible();
    // The remarks thread and files sit under the document.
    await expect(
      await canvas.findByRole("heading", { name: "Remarks" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await expect(await canvas.findByText("Approved")).toBeVisible();
  },
};

/** A rejected one shows the reason and offers Edit. */
export const Rejected: Story = {
  args: { id: REJECTED_OUT.id },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Wrong account/)).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
  },
};

/** A transfer shows both accounts; Edit opens the transfer form. */
export const Transfer: Story = {
  args: { document: "transfer", id: PENDING_TRANSFER.id },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("Transfer between accounts"),
    ).toBeVisible();
    await expect(canvas.getByText("HDFC Current A/c (Bank)")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Edit" }));
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Edit TXN/26-27/00004",
      }),
    ).toBeVisible();
  },
};
