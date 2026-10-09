import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  EMPTY_STATEMENT,
  PROJECT_ID,
  RAJU_ID,
  RAJU_STATEMENT,
} from "./payment-fixtures";
import { StatementSheet } from "./statement-sheet";

const STATEMENT = `/api/construction/labour/balances/statement?projectId=${PROJECT_ID}&partyType=labour&partyId=${RAJU_ID}&from=2026-09-01&to=2026-09-30`;
const PAID_ID = "0199a000-0000-7000-8000-0000000000d1";
const CANCEL = `/api/construction/labour/payments/${PAID_ID}/cancel`;

let api: ReturnType<typeof mockApi>;

function serve(statement: typeof RAJU_STATEMENT) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === STATEMENT)
        return Response.json(statement);
      if (call.method === "POST" && call.path === CANCEL)
        return new Response(null, { status: 204 });
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Payments/Statement sheet",
  component: StatementSheet,
  args: {
    projectId: PROJECT_ID,
    partyType: "labour",
    party: { id: RAJU_ID, name: "Raju Pawar" },
    range: { from: "2026-09-01", to: "2026-09-30" },
    onOpenChange: fn(),
  },
  render: (args) => (
    <StoryQueries>
      <StatementSheet {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof StatementSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Entries with their Project and running balance; cancel a payment after a confirm. */
export const RunningBalance: Story = {
  beforeEach: serve(RAJU_STATEMENT),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sheet = within(
      await body.findByRole("dialog", { name: "Raju Pawar" }),
    );
    const entries = await sheet.findByRole("list", { name: "Entries" });
    const items = within(entries).getAllByRole("listitem");
    await expect(items).toHaveLength(4);
    await expect(items[1]).toHaveTextContent("Villa");
    await expect(items[1]).toHaveTextContent("Balance ₹2,400.00");
    await expect(items[3]).toHaveTextContent("Payment cancelled");
    await expect(sheet.getByText("₹2,300.00")).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Receipt" })).toHaveAttribute(
      "href",
      `/api/construction/labour/payments/${PAID_ID}/receipt`,
    );
    // Only the live payment can be cancelled.
    const cancel = sheet.getAllByRole("button", { name: "Cancel payment" });
    await expect(cancel).toHaveLength(1);
    const [first] = cancel;
    if (first == null) throw new Error("No cancel button");
    await userEvent.click(first);
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Cancel this payment of ₹300.00?",
      }),
    );
    await userEvent.click(
      confirm.getByRole("button", { name: "Cancel payment" }),
    );
    await waitFor(() =>
      expect(
        api.calls.mock.calls.some(
          ([call]) =>
            call.method === "POST" &&
            call.path === CANCEL &&
            JSON.stringify(call.body) ===
              JSON.stringify({ expectedUpdatedAt: "2026-09-12T10:00:00.000Z" }),
        ),
      ).toBe(true),
    );
  },
};

/** No entries in the period: the opening and closing balance still show. */
export const NoEntries: Story = {
  beforeEach: serve(EMPTY_STATEMENT),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const sheet = within(
      await body.findByRole("dialog", { name: "Raju Pawar" }),
    );
    await expect(
      await sheet.findByText("No entries in this period."),
    ).toBeVisible();
    await expect(sheet.getAllByText("₹1,500.00")).toHaveLength(2);
  },
};
