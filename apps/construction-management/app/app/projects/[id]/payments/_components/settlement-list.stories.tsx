import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  DECIDED_SETTLEMENTS,
  partyMoneyHandler,
  PENDING_SETTLEMENTS,
  PROJECT_ID,
} from "./party-fixtures";
import { SettlementList } from "./settlement-list";

const SETTLEMENTS = "/api/construction/finance/settlements";
const [FIRST, SECOND] = PENDING_SETTLEMENTS as [
  (typeof PENDING_SETTLEMENTS)[number],
  (typeof PENDING_SETTLEMENTS)[number],
];

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown[] {
  return api.calls.mock.calls
    .filter(([call]) => call.method === "POST" && call.path === path)
    .map(([call]) => call.body);
}

function writes(call: ApiCall): Response | undefined {
  if (call.method !== "POST") return undefined;
  if (call.path.startsWith(`${SETTLEMENTS}/bulk-`))
    return Response.json({ items: PENDING_SETTLEMENTS });
  if (call.path.startsWith(SETTLEMENTS))
    return Response.json({ ...FIRST, status: "approved" });
  return undefined;
}

const meta = {
  title: "Finance/Parties/Settlements",
  component: SettlementList,
  args: { projectId: PROJECT_ID, partyType: "supplier" },
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(writes));
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-4xl p-6">
        <SettlementList {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof SettlementList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Approve one; reject the ticked ones together with a reason. */
export const ApproveAndBulkReject: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Settlements" }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(2);
    await expect(list.getByText("Sales")).toBeVisible();
    await userEvent.click(
      list.getByRole("button", {
        name: `Approve ${FIRST.invoice.invoiceNumber}`,
      }),
    );
    await waitFor(() =>
      expect(posted(`${SETTLEMENTS}/${FIRST.id}/approve`)).toHaveLength(1),
    );

    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all" }));
    await expect(canvas.getByText("2 selected")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Reject selected" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(await dialog.findByText("Say why")).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Collect the balance",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(posted(`${SETTLEMENTS}/bulk-reject`)).toEqual([
        { ids: [FIRST.id, SECOND.id], reason: "Collect the balance" },
      ]),
    );
  },
};

/** All or none: a refused bulk approval names each refusal. */
export const BulkRefused: Story = {
  beforeEach: () => {
    api = mockApi(
      partyMoneyHandler((call) =>
        call.method === "POST" && call.path === `${SETTLEMENTS}/bulk-approve`
          ? Response.json(
              {
                code: "BULK_DECISION_REFUSED",
                message: "One of them cannot be decided; nothing was changed.",
                details: {
                  refusals: [
                    {
                      id: SECOND.id,
                      code: "INVOICE_NO_BALANCE",
                      message:
                        "Invoice INV/26-27/00003 has nothing left to settle.",
                    },
                  ],
                },
              },
              { status: 409 },
            )
          : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Settlements" });
    await userEvent.click(canvas.getByRole("checkbox", { name: "Select all" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Approve selected" }),
    );
    await expect(
      await canvas.findByText(
        /nothing was changed. Invoice INV\/26-27\/00003 has nothing left to settle./,
      ),
    ).toBeVisible();
  },
};

/** Without Approve or Reject a member only sees them; decided ones show who and why. */
export const ReadOnlyAndDecided: Story = {
  beforeEach: () => {
    api = mockApi(
      partyMoneyHandler((call) =>
        call.method === "GET" && call.path.startsWith(SETTLEMENTS)
          ? Response.json({
              items: call.path.includes("status=rejected")
                ? DECIDED_SETTLEMENTS
                : PENDING_SETTLEMENTS.map((item) => ({
                    ...item,
                    actions: { approve: false, reject: false },
                  })),
            })
          : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Settlements" });
    await expect(
      canvas.queryByRole("checkbox", { name: "Select all" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Approve / }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("tab", { name: "Rejected" }));
    await expect(
      await canvas.findByText("Rejected: Collect the balance"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Rejected by Arun Selva Kumar"),
    ).toBeVisible();
  },
};

export const NothingPending: Story = {
  beforeEach: () => {
    api = mockApi(partyMoneyHandler(undefined, { empty: true }));
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nothing waiting for approval"),
    ).toBeVisible();
  },
};
