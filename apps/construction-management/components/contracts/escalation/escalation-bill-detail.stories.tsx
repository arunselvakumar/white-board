import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import {
  BILL_DRAFT,
  BILL_NEGATIVE,
  DRAFT,
  NEGATIVE,
  PROJECT,
} from "./escalation-fixtures";
import { EscalationBillDetail } from "./escalation-bill-detail";
import type { EscalationBill } from "@/src/queries/contracts-escalation";

const API = "/api/construction/contracts/escalation-bills";

let api: ReturnType<typeof mockApi>;

function serve(bill: EscalationBill) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === `${API}/${bill.id}`)
        return Response.json(bill);
      if (call.method === "POST" && call.path === `${API}/${bill.id}/submit`)
        return Response.json({
          ...bill,
          status: "pending_approval",
          number: "CB/26-27/00007",
          ordinal: 1,
          allowed: {
            ...bill.allowed,
            edit: false,
            refresh: false,
            delete: false,
            submit: false,
          },
        });
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Contracts/Escalation/Bill",
  component: EscalationBillDetail,
  args: { projectId: PROJECT, id: BILL_DRAFT },
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${PROJECT}/contractor-bills/escalation/${BILL_DRAFT}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <EscalationBillDetail {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof EscalationBillDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The ticket's example: the working per component, GST, retention and net; submit numbers it. */
export const Draft: Story = {
  beforeEach: serve(DRAFT),
  play: async ({ canvas, userEvent }) => {
    const shown = async (text: string) => {
      const found = (await canvas.findAllByText(text)).find((element) =>
        element.checkVisibility(),
      );
      await expect(found).toBeDefined();
    };
    await shown("₹12,750.00");
    await shown("₹17,000.00");
    await shown("−₹8,500.00");
    await expect(canvas.getByText("₹24,012.50")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Submit for approval" }),
    );
    await waitFor(() => {
      expect(api.calls).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: `${API}/${BILL_DRAFT}/submit`,
          body: { expectedUpdatedAt: DRAFT.updatedAt },
        }),
      );
    });
  },
};

/** Indices fell: no invoice, and what the running bills still have to recover. */
export const Negative: Story = {
  args: { id: BILL_NEGATIVE },
  beforeEach: serve(NEGATIVE),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/The indices fell/)).toBeVisible();
    await expect(
      canvas.getByText(/Recovered ₹10,000.00 of ₹42,500.00; ₹32,500.00 left\./),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Reverse" })).toBeVisible();
  },
};

/** At 375 px each component is a card and nothing scrolls sideways. */
export const Phone: Story = {
  beforeEach: serve(DRAFT),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const cards = await canvas.findByRole("list", { name: "Components" });
    await expect(within(cards).getAllByRole("listitem")).toHaveLength(3);
    await waitFor(() => {
      expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
        canvasElement.clientWidth + 1,
      );
    });
  },
};
