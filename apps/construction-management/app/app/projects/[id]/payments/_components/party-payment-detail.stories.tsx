import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  CONTRACTOR_ID,
  CONTRACTOR_INVOICE,
  CONTRACTOR_PAYMENT,
  partyMoneyHandler,
  PROJECT_ID,
} from "./party-fixtures";
import { PartyPaymentDetail } from "./party-payment-detail";

const PAYMENT = `/api/construction/finance/party-payments/${CONTRACTOR_PAYMENT.id}`;

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown[] {
  return api.calls.mock.calls
    .filter(([call]) => call.method === "POST" && call.path === path)
    .map(([call]) => call.body);
}

function writes(call: ApiCall): Response | undefined {
  if (call.method !== "POST") return undefined;
  if (call.path === `${PAYMENT}/cancel`)
    return new Response(null, { status: 204 });
  if (call.path === `${PAYMENT}/apply-advance`)
    return Response.json({ ...CONTRACTOR_PAYMENT, unallocated: 0 });
  return undefined;
}

const meta = {
  title: "Finance/Parties/Payment",
  component: PartyPaymentDetail,
  args: {
    projectId: PROJECT_ID,
    partyType: "contractor",
    paymentId: CONTRACTOR_PAYMENT.id,
  },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(writes));
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <PartyPaymentDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PartyPaymentDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** TDS, settled, advance and the receipt; Apply advance allocates the rest. */
export const ContractorPaymentApplyAdvance: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "PAY/26-27/00010" }),
    ).toBeVisible();
    await expect(canvas.getByText("₹500.00 at 1.00%")).toBeVisible();
    await expect(canvas.getByText("₹50,000.00")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Receipt PDF" }),
    ).toHaveAttribute("href", `${PAYMENT}/receipt`);
    await userEvent.click(
      canvas.getByRole("button", { name: "Apply advance" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.click(await dialog.findByRole("button", { name: "Fill" }));
    await expect(
      dialog.getByLabelText(CONTRACTOR_INVOICE.invoiceNumber),
    ).toHaveValue("10000");
    await userEvent.click(dialog.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(posted(`${PAYMENT}/apply-advance`)).toEqual([
        {
          expectedUpdatedAt: CONTRACTOR_PAYMENT.updatedAt,
          allocations: [
            { invoiceId: CONTRACTOR_INVOICE.id, amount: 10_000_00 },
          ],
        },
      ]),
    );
  },
};

export const CancelPayment: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Cancel payment" }),
    );
    const confirm = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await expect(
      confirm.getByText(/goes back to HDFC Current A\/c/),
    ).toBeVisible();
    await userEvent.click(
      confirm.getByRole("button", { name: "Cancel payment" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${PROJECT_ID}/payments/contractors/${CONTRACTOR_ID}`,
      ),
    );
    await expect(posted(`${PAYMENT}/cancel`)).toEqual([
      { expectedUpdatedAt: CONTRACTOR_PAYMENT.updatedAt },
    ]);
  },
};

/** A closed period: the cancel is refused and the payment stays. */
export const CancelRefused: Story = {
  beforeEach: () => {
    api = mockApi(
      partyMoneyHandler((call) =>
        call.method === "POST" && call.path === `${PAYMENT}/cancel`
          ? Response.json(
              {
                code: "FINANCIAL_PERIOD_CLOSED",
                message:
                  "The books are closed up to 2026-10-31. Entries dated on or before it cannot be edited.",
              },
              { status: 403 },
            )
          : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Cancel payment" }),
    );
    const confirm = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await userEvent.click(
      confirm.getByRole("button", { name: "Cancel payment" }),
    );
    await expect(
      await confirm.findByText(/The books are closed up to 2026-10-31/),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};
