import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { mockFinanceDocumentApi } from "@/components/finance/documents/finance-document-fixtures";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import { TransactionDialog } from "./transaction-form";
import {
  PENDING_OUT,
  PROJECT_ID,
  STORY_TODAY,
  transactionsHandler,
} from "./transaction-fixtures";

let api: ReturnType<typeof mockApi>;

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Finance/Transactions/Transaction form",
  component: TransactionDialog,
  args: {
    projectId: PROJECT_ID,
    transaction: null,
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
      <TransactionDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TransactionDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Amount and the UPI reference are required before anything is sent. */
export const Validation: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "New transaction" });
    await userEvent.click(page.getByRole("button", { name: "UPI" }));
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect(
      await page.findByText("Enter an amount above zero, like 1500.50"),
    ).toBeVisible();
    await expect(
      page.getByText("Enter the transaction reference"),
    ).toBeVisible();
    await expect(posted()).toHaveLength(0);
  },
};

/** Cash from the primary account, a typed payee, Save & Approve. */
export const SaveAndApprove: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "New transaction" });
    await userEvent.type(page.getByLabelText("Amount"), "1500.50");
    await userEvent.type(page.getByLabelText("Paid To"), "Indian Oil");
    await userEvent.click(page.getByRole("button", { name: "Save & Approve" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted()[0]?.body).toMatchObject({
      projectId: PROJECT_ID,
      type: "payment_out",
      mode: "cash",
      accountId: "0199a000-0000-7000-8000-000000000001",
      amount: 1_500_50,
      counterparty: { kind: null, id: null, name: "Indian Oil" },
      approve: true,
      confirmDuplicateReference: false,
    });
  },
};

/** A reference already used asks first; Save anyway sends the confirmation. */
export const DuplicateReference: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "New transaction" });
    await userEvent.click(page.getByRole("button", { name: "Online" }));
    await userEvent.type(await page.findByLabelText("Reference"), "UTR555");
    await userEvent.type(page.getByLabelText("Amount"), "250");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await expect(
      await page.findByText(
        "UTR555 is already on Transaction TXN/26-27/00002 of this account. Save anyway if it is right.",
      ),
    ).toBeVisible();
    await expect(args.onClose).not.toHaveBeenCalled();
    await userEvent.click(page.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted()[1]?.body).toMatchObject({
      reference: "UTR555",
      accountId: "0199a000-0000-7000-8000-000000000002",
      confirmDuplicateReference: true,
    });
  },
};

/** Without Approve there is only Save. */
export const WithoutApprove: Story = {
  args: { canApprove: false },
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "New transaction" });
    await expect(
      page.queryByRole("button", { name: "Save & Approve" }),
    ).toBeNull();
  },
};

/** Editing a cheque Transaction keeps its fields and sends `expectedUpdatedAt`. */
export const Edit: Story = {
  args: { transaction: PENDING_OUT },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "Edit TXN/26-27/00001" });
    await expect(page.getByLabelText("Cheque number")).toHaveValue("000123");
    const amount = page.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "30000");
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted()[0]?.path).toContain(`/${PENDING_OUT.id}/update`);
    await expect(posted()[0]?.body).toMatchObject({
      amount: 30_000_00,
      chequeNumber: "000123",
      counterparty: { kind: "contractor", name: "Sri Murugan Builders" },
      expectedUpdatedAt: PENDING_OUT.updatedAt,
    });
  },
};

/** Files picked on a new Transaction upload to it once it is saved. */
export const WithReceipt: Story = {
  beforeEach: () => {
    const register = transactionsHandler();
    const documents = mockFinanceDocumentApi({ files: [], remarks: [] });
    api = mockApi((call) => documents(call) ?? register(call));
    const xhr = mockXhrUploads({ stepMs: 5 });
    return () => {
      xhr.restore();
      api.restore();
    };
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const page = body(canvasElement);
    await page.findByRole("dialog", { name: "New transaction" });
    await userEvent.type(page.getByLabelText("Amount"), "800");
    await userEvent.upload(
      page.getByLabelText("Choose files for Files"),
      new File(["%PDF"], "Bank advice.pdf", { type: "application/pdf" }),
    );
    await userEvent.click(page.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(
      posted().some((call) =>
        call.path.startsWith(
          "/api/construction/finance/documents/transaction/0199a000-0000-7000-8000-000000001099/files",
        ),
      ),
    ).toBe(true);
  },
};
