import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import {
  GANG_ADVANCE,
  LABOUR_SEPTEMBER,
  LABOUR_WEEK,
  NO_VENDORS,
  page,
  PAYERS,
  PROJECT_ID,
  RAJU_PAYMENT,
  TODAY,
} from "./payment-fixtures";
import { PaymentsPage } from "./payments-page";

const BALANCES = "/api/construction/labour/balances";
const PAYMENTS = "/api/construction/labour/payments";

let api: ReturnType<typeof mockApi>;

function gets(prefix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "GET" && call.path.startsWith(prefix));
}

function serve(options: { payments?: (typeof RAJU_PAYMENT)[] } = {}) {
  return () => {
    api = mockApi((call) => {
      if (call.method !== "GET") return undefined;
      const url = new URL(call.path, "http://storybook.local");
      if (url.pathname === BALANCES) {
        const partyType = url.searchParams.get("partyType");
        if (partyType === "vendor") return Response.json(NO_VENDORS);
        return Response.json(
          url.searchParams.get("kind") === "weekly"
            ? LABOUR_WEEK
            : LABOUR_SEPTEMBER,
        );
      }
      if (url.pathname === `${PAYMENTS}/payers`) return Response.json(PAYERS);
      if (url.pathname === PAYMENTS) {
        const kind = url.searchParams.get("kind");
        const items = (options.payments ?? []).filter(
          (item) => kind == null || item.kind === kind,
        );
        return Response.json(page(items));
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Payments/Payments page",
  component: PaymentsPage,
  args: { projectId: PROJECT_ID, today: TODAY },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-6xl p-4">
        <PaymentsPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PaymentsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** September's figures per labourer, then the week around today. */
export const LabourWithPeriodSwitch: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Pay Raju Pawar" }),
    ).toBeVisible();
    await expect(canvas.getByText("September 2026")).toBeVisible();
    // Raju's Final Amount and the total of both labourers.
    await expect(canvas.getAllByText("₹2,000.00").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("₹3,350.00").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Other Project").length).toBeGreaterThan(
      0,
    );
    await expect(gets(BALANCES).at(-1)?.path).toBe(
      `${BALANCES}?projectId=${PROJECT_ID}&partyType=labour&kind=monthly&anchor=${TODAY}`,
    );

    await userEvent.click(canvas.getByRole("button", { name: "Weekly" }));
    await expect(
      await canvas.findByText(/^14 Sept? 2026 – 20 Sept? 2026$/),
    ).toBeVisible();
    await waitFor(() =>
      expect(gets(BALANCES).at(-1)?.path).toBe(
        `${BALANCES}?projectId=${PROJECT_ID}&partyType=labour&kind=weekly&anchor=${TODAY}`,
      ),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Pay Seema Kale" }),
      ).toBeNull(),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Monthly" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next month" }));
    await expect(await canvas.findByText("October 2026")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Custom" }));
    await expect(canvas.getByLabelText("From")).toHaveValue("2026-10-01");
    await expect(canvas.getByLabelText("To")).toHaveValue("2026-10-31");
  },
};

/** Pay opens the dialog with the row's Final Amount. */
export const PayFromRow: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Pay Raju Pawar" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Pay Raju Pawar" }),
    );
    await expect(await dialog.findByLabelText("Amount")).toHaveValue("2000");
  },
};

/** No vendors on the Project: an empty state, not an empty table. */
export const EmptyVendors: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("tab", { name: "Vendor" }));
    await expect(await canvas.findByText("No Vendors to pay")).toBeVisible();
  },
};

/** Recorded payments with a kind filter. */
export const PaymentsTab: Story = {
  args: { initialTab: "payments" },
  beforeEach: serve({ payments: [RAJU_PAYMENT, GANG_ADVANCE] }),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("2 payments · ₹5,300.00"),
    ).toBeVisible();
    await expect(canvas.getAllByText("Suresh Gang").length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "Advances" }));
    await expect(
      await canvas.findByText("1 payment · ₹5,000.00"),
    ).toBeVisible();
    await expect(gets(PAYMENTS).at(-1)?.path).toBe(
      `${PAYMENTS}?projectId=${PROJECT_ID}&kind=advance`,
    );
  },
};

/** Nothing recorded yet. */
export const NoPayments: Story = {
  args: { initialTab: "payments" },
  beforeEach: serve(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("No payments yet")).toBeVisible();
  },
};
