import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  RAVI_ACCOUNT,
  STORY_PROJECT_ID,
  STORY_VOUCHERS,
  pettyCashHandler,
  type PettyCashApiOptions,
} from "./petty-cash-fixtures";
import { VoucherForm } from "./voucher-form";

let api: ReturnType<typeof mockApi>;

function serve(options: PettyCashApiOptions = {}) {
  return () => {
    api = mockApi(pettyCashHandler(options));
    return api.restore;
  };
}

function posted(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(path));
}

async function choose(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  trigger: HTMLElement,
  option: string,
) {
  await userEvent.click(trigger);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await body.findByRole("option", { name: option }));
}

const meta = {
  title: "Finance/Petty Cash/Voucher form",
  component: VoucherForm,
  args: { projectId: STORY_PROJECT_ID, accountId: RAVI_ACCOUNT.id },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <VoucherForm {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VoucherForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A Payment: required fields refused on the spot, then saved. */
export const NewPayment: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const save = await canvas.findByRole("button", { name: "Save" });
    await userEvent.click(save);
    await expect(await canvas.findByText("Enter the amount")).toBeVisible();
    await expect(canvas.getByText("Choose a Payment Category")).toBeVisible();
    await expect(posted("/petty-cash/vouchers")).toHaveLength(0);

    await userEvent.type(canvas.getByLabelText("Amount"), "750.50");
    await choose(
      canvasElement,
      userEvent,
      canvas.getByLabelText("Payment Category"),
      "Fuel",
    );
    await userEvent.type(canvas.getByLabelText("Paid to"), "Sri Murugan Fuels");
    await userEvent.type(canvas.getByLabelText("Paid for"), "Diesel");
    await userEvent.click(save);
    await waitFor(async () => {
      await expect(posted("/petty-cash/vouchers")).toHaveLength(1);
    });
    await expect(posted("/petty-cash/vouchers")[0]?.body).toMatchObject({
      accountId: RAVI_ACCOUNT.id,
      voucherType: "payment",
      projectId: STORY_PROJECT_ID,
      amount: 750_50,
      paymentCategoryId: "0199a000-0000-7000-8000-0000000000c2",
      counterparty: { kind: null, id: null, name: "Sri Murugan Fuels" },
      toAccountId: null,
      paidFor: "Diesel",
      approve: false,
    });
  },
};

/** Transfer: no category or party; the account the money goes to instead. */
export const Transfer: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Transfer" }),
    );
    await expect(canvas.queryByLabelText("Payment Category")).toBeNull();
    await expect(canvas.queryByLabelText("Paid to")).toBeNull();
    await userEvent.type(canvas.getByLabelText("Amount"), "500");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Choose the account the money goes to"),
    ).toBeVisible();
    await choose(
      canvasElement,
      userEvent,
      canvas.getByLabelText("To account"),
      "Company's Cash Account",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save & Approve" }),
    );
    await waitFor(async () => {
      await expect(posted("/petty-cash/vouchers")).toHaveLength(1);
    });
    await expect(posted("/petty-cash/vouchers")[0]?.body).toMatchObject({
      voucherType: "transfer",
      toAccountId: "0199a000-0000-7000-8000-000000000001",
      paymentCategoryId: null,
      counterparty: { kind: null, id: null, name: null },
      approve: true,
    });
  },
};

/** Without Approve there is no Save & Approve. */
export const WithoutApprove: Story = {
  beforeEach: serve({ flags: ["read", "create"] }),
  play: async ({ canvas }) => {
    await canvas.findByRole("button", { name: "Save" });
    await expect(
      canvas.queryByRole("button", { name: "Save & Approve" }),
    ).toBeNull();
  },
};

/** The server refuses a date in a closed period: the reason shows under Date. */
export const ClosedPeriodRefused: Story = {
  beforeEach: serve({
    createError: {
      status: 403,
      code: "FINANCIAL_PERIOD_CLOSED",
      message:
        "The books are closed up to 2026-09-30. Entries dated on or before it cannot be created.",
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Amount"), "100");
    await choose(
      canvasElement,
      userEvent,
      canvas.getByLabelText("Payment Category"),
      "Fuel",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "The books are closed up to 2026-09-30. Entries dated on or before it cannot be created.",
      ),
    ).toBeVisible();
  },
};

/** Editing an approved voucher says it goes back for approval. */
export const EditApproved: Story = {
  args: { voucher: STORY_VOUCHERS[1] },
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        "This voucher is approved. Saving a change reverses its entries and sends it back for approval.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Amount")).toHaveValue("2000");
    const amount = canvas.getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "2100");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await waitFor(async () => {
      await expect(posted("/update")).toHaveLength(1);
    });
    await expect(posted("/update")[0]?.body).toMatchObject({
      amount: 2_100_00,
      expectedUpdatedAt: "2026-10-08T06:30:00.000Z",
    });
  },
};

/** Mobile: fields stack without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("button", { name: "Save" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
