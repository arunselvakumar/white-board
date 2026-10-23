import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import type { Reconciliation } from "@/src/queries/contracts-reconciliation";

import {
  AT_BILL_1,
  AT_BILL_2,
  BILL_1,
  BILL_2,
  RECONCILIATION_WORK_ORDER,
  REQUEST,
  UNDER_USE,
  WITHOUT_FINANCIAL,
} from "./work-order-reconciliation-fixtures";
import { WorkOrderReconciliation } from "./work-order-reconciliation";

const API = `/api/construction/contracts/work-orders/${RECONCILIATION_WORK_ORDER}/reconciliation`;
const ASSIGN = `/api/construction/procurement/material-requests/${REQUEST}/assign-work-order`;

let api: ReturnType<typeof mockApi>;

/** The materials in view: the table from md up, the cards below. */
async function shown(canvas: {
  findAllByLabelText: (text: string) => Promise<HTMLElement[]>;
}): Promise<HTMLElement> {
  const found = (await canvas.findAllByLabelText("Materials reconciled")).find(
    (element) => element.checkVisibility(),
  );
  if (found == null) throw new Error("The materials are not shown");
  return found;
}

/** Answers the default statement, and per bill when `?billId=` names one. */
function serve(
  statement: Reconciliation,
  byBill: Record<string, Reconciliation> = {},
) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === API) {
        const billId = url.searchParams.get("billId");
        return Response.json(
          billId == null ? statement : (byBill[billId] ?? statement),
        );
      }
      if (call.method === "POST" && url.pathname === ASSIGN)
        return Response.json({ id: REQUEST });
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Contracts/Work Orders/Material reconciliation",
  component: WorkOrderReconciliation,
  args: { workOrderId: RECONCILIATION_WORK_ORDER, canPrint: true },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <WorkOrderReconciliation {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof WorkOrderReconciliation>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The latest approved bill by default: 634 bags theoretical, 646.68
 * allowed, 700 issued, 53.32 excess at ₹500 a bag, ₹26,660 recovered on
 * the bill; the PDF prints the statement at that bill.
 */
export const AtLatestApprovedBill: Story = {
  beforeEach: serve(AT_BILL_1),
  play: async ({ canvas }) => {
    const materials = within(await shown(canvas));
    await expect(materials.getByText("634")).toBeVisible();
    await expect(materials.getByText("646.68")).toBeVisible();
    await expect(materials.getByText("700")).toBeVisible();
    await expect(materials.getByText("53.32")).toBeVisible();
    await expect(materials.getByText("₹26,660.00")).toBeVisible();
    await expect(canvas.getByLabelText("Bill")).toHaveTextContent(
      "WO3/RA/01 · RA 1",
    );
    await expect(
      canvas.getByRole("link", { name: "Statement PDF" }),
    ).toHaveAttribute("href", `${API}/pdf?billId=${BILL_1}`);
    await expect(
      canvas.getByText(/Returns from the Contractor are not recorded yet/),
    ).toBeVisible();
  },
};

/** Picking the draft bill: 13.984 excess, ₹6,992 cumulative, nothing more to recover. */
export const PickTheDraftBill: Story = {
  beforeEach: serve(AT_BILL_1, { [BILL_2]: AT_BILL_2 }),
  play: async ({ canvas, userEvent }) => {
    await shown(canvas);
    await userEvent.click(canvas.getByLabelText("Bill"));
    await userEvent.click(
      await within(document.body).findByRole("option", {
        name: /^Draft bill of/,
      }),
    );
    await waitFor(async () => {
      await expect(
        within(await shown(canvas)).getByText("13.984"),
      ).toBeVisible();
    });
    const materials = within(await shown(canvas));
    await expect(materials.getByText("760.8")).toBeVisible();
    await expect(materials.getByText("₹0.00")).toBeVisible();
    await expect(
      api.calls.mock.calls.some(([call]) =>
        call.path.endsWith(`?billId=${BILL_2}`),
      ),
    ).toBe(true);
  },
};

/**
 * Under-use is flagged (600 bags for 634), and an issue no rule attributes
 * is assigned to this Work Order through procurement's command.
 */
export const UnderUseAndAssign: Story = {
  beforeEach: serve(UNDER_USE),
  play: async ({ canvas, userEvent }) => {
    const materials = within(await shown(canvas));
    await expect(materials.getByText("Under-used")).toBeVisible();
    const unattributed = within(
      canvas.getByRole("list", { name: "Unattributed issues" }),
    );
    await expect(unattributed.getByText("Cement OPC 53 · 30")).toBeVisible();
    await userEvent.click(
      unattributed.getByRole("button", {
        name: "Assign DN/26-27/00019 to this Work Order",
      }),
    );
    await waitFor(async () => {
      await expect(
        api.calls.mock.calls
          .map(([call]) => call)
          .find((call) => call.method === "POST" && call.path === ASSIGN)?.body,
      ).toEqual({ workOrderId: RECONCILIATION_WORK_ORDER });
    });
  },
};

/** Without Financial: quantities only, no rates or recoveries, and no assigning. */
export const WithoutFinancial: Story = {
  beforeEach: serve({
    ...WITHOUT_FINANCIAL,
    unattributed: UNDER_USE.unattributed,
  }),
  play: async ({ canvas }) => {
    const materials = within(await shown(canvas));
    await expect(materials.getByText("53.32")).toBeVisible();
    await expect(materials.queryByText("₹26,660.00")).toBeNull();
    await expect(
      canvas.getByText(/Rates and recoveries need the Work Order/),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Assign .* to this Work Order/ }),
    ).toBeNull();
  },
};

/** At 375 px each material is a card and nothing scrolls sideways. */
export const Phone: Story = {
  beforeEach: serve(UNDER_USE),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const cards = await canvas.findByRole("list", {
      name: "Materials reconciled",
    });
    const [first] = within(cards).getAllByRole("listitem");
    if (first == null) throw new Error("No material card");
    const card = within(first);
    await expect(card.getByText("Under-used")).toBeVisible();
    await expect(card.getByText("634")).toBeVisible();
    await waitFor(async () => {
      await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
        canvasElement.clientWidth + 1,
      );
    });
  },
};
