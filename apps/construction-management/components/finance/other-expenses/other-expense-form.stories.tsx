import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  ACCOUNT_OPTIONS,
  financeLookupsHandler,
  PAYMENT_CATEGORY_OPTIONS,
} from "../account-fixtures";
import {
  DIESEL_EXPENSE,
  financeAccessHandler,
  PROJECT_ID,
  TEA_EXPENSE,
  TODAY,
} from "./other-expense-fixtures";
import { OtherExpenseForm } from "./other-expense-form";

const API = "/api/construction/finance/other-expenses";

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown {
  return api.calls.mock.calls
    .map(([call]) => call)
    .find((call) => call.method === "POST" && call.path === path)?.body;
}

function posts(): number {
  return api.calls.mock.calls.filter(([call]) => call.method === "POST").length;
}

function serve(
  write: (call: ApiCall) => Response | undefined,
  flags?: Parameters<typeof financeAccessHandler>[1],
) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "POST") return write(call);
      return financeAccessHandler(call, flags) ?? financeLookupsHandler(call);
    });
    return api.restore;
  };
}

const meta = {
  title: "Finance/Other Expenses/Form",
  component: OtherExpenseForm,
  args: { projectId: PROJECT_ID, expense: null, today: TODAY },
  render: (args) => (
    <StoryQueries>
      <OtherExpenseForm {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof OtherExpenseForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const [, BANK] = ACCOUNT_OPTIONS;
const [, FUEL] = PAYMENT_CATEGORY_OPTIONS;

/**
 * Checks the fields, moves "Paid from" to a bank account for UPI, asks
 * for the reference, and Save & Approve sends paise with `approve`.
 */
export const AddAndApprove: Story = {
  beforeEach: serve((call) =>
    call.path === API
      ? Response.json({ ...DIESEL_EXPENSE }, { status: 201 })
      : undefined,
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByLabelText("Date")).toHaveValue(TODAY);
    const paidFrom = await canvas.findByRole("combobox", { name: "Paid from" });
    await waitFor(() =>
      expect(paidFrom).toHaveTextContent("Company's Cash Account"),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Choose the Payment Category"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter an amount more than zero"),
    ).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.click(
      canvas.getByRole("combobox", { name: "Payment Category" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Fuel" }));
    await userEvent.type(
      canvas.getByLabelText("Paid to"),
      "Indian Oil, Guindy",
    );
    await userEvent.type(canvas.getByLabelText("Amount"), "12500");
    await userEvent.click(canvas.getByRole("button", { name: "UPI" }));
    await waitFor(() => expect(paidFrom).toHaveTextContent("HDFC Current A/c"));
    await userEvent.click(
      canvas.getByRole("button", { name: "Save & Approve" }),
    );
    await expect(
      await canvas.findByText("Enter the transaction reference"),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Reference"), "UPI 4412 9981");
    await userEvent.type(
      canvas.getByLabelText("Description"),
      "Diesel for the generator",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save & Approve" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${PROJECT_ID}/payments/other-expenses/${DIESEL_EXPENSE.id}`,
      ),
    );
    await expect(posted(API)).toEqual({
      projectId: PROJECT_ID,
      expenseDate: TODAY,
      paymentCategoryId: FUEL?.id,
      payeeName: "Indian Oil, Guindy",
      accountId: BANK?.id,
      mode: "upi",
      reference: "UPI 4412 9981",
      amount: 1_250_000,
      description: "Diesel for the generator",
      approve: true,
    });
  },
};

/** Without Approve there is only Save; a back-dated refusal lands on the date. */
export const BackdatedRefused: Story = {
  beforeEach: serve(
    () =>
      Response.json(
        {
          code: "BACKDATED_CREATE_BLOCKED",
          message:
            "Other Expenses entries older than 2 days cannot be created. The earliest date allowed is 2026-10-09.",
        },
        { status: 403 },
      ),
    ["create", "read"],
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("combobox", { name: "Payment Category" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Site Expenses" }),
    );
    await userEvent.type(canvas.getByLabelText("Amount"), "450");
    const date = canvas.getByLabelText("Date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-01");
    await expect(
      canvas.queryByRole("button", { name: "Save & Approve" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(/earliest date allowed is 2026-10-09/),
    ).toBeVisible();
    await expect(date).toHaveAttribute("aria-invalid", "true");
    await expect(posted(API)).toMatchObject({
      expenseDate: "2026-10-01",
      amount: 45_000,
      mode: "cash",
    });
  },
};

/** Editing an approved expense warns that it goes back for approval. */
export const EditApproved: Story = {
  args: { expense: DIESEL_EXPENSE },
  beforeEach: serve((call) =>
    call.path === `${API}/${DIESEL_EXPENSE.id}/update`
      ? Response.json({ ...DIESEL_EXPENSE, status: "pending" })
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(/sends it for approval again/),
    ).toBeVisible();
    // Files are added on the expense itself once it exists.
    await expect(canvas.queryByText(/Choose files/)).toBeNull();
    const amount = canvas.getByLabelText("Amount");
    await expect(amount).toHaveValue("12500");
    await userEvent.clear(amount);
    await userEvent.type(amount, "13000");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted(`${API}/${DIESEL_EXPENSE.id}/update`)).toMatchObject({
        amount: 1_300_000,
        mode: "upi",
        reference: "UPI 4412 9981",
        expectedUpdatedAt: DIESEL_EXPENSE.updatedAt,
      }),
    );
    await expect(
      posted(`${API}/${DIESEL_EXPENSE.id}/update`),
    ).not.toHaveProperty("approve");
  },
};

/** A cheque needs its number in the reference. */
export const ChequeNeedsNumber: Story = {
  args: { expense: TEA_EXPENSE },
  beforeEach: serve(() => undefined),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Cheque" }),
    );
    await expect(canvas.getByLabelText("Cheque number")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the cheque number"),
    ).toBeVisible();
    await expect(posts()).toBe(0);
  },
};
