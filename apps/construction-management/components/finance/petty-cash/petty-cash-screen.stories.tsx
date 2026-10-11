import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  EMPTY_ACCOUNT,
  MEENA_ACCOUNT,
  RAVI_ACCOUNT,
  STORY_PROJECT_ID,
  pettyCashHandler,
  type PettyCashApiOptions,
} from "./petty-cash-fixtures";
import { PettyCashScreen } from "./petty-cash-screen";

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

function first(elements: HTMLElement[]): HTMLElement {
  const [element] = elements;
  if (element == null) throw new Error("Not found");
  return element;
}

const meta = {
  title: "Finance/Petty Cash/Screen",
  component: PettyCashScreen,
  args: { projectId: STORY_PROJECT_ID },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl">
        <PettyCashScreen {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PettyCashScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** View all: every holder's card; the viewer's own is chosen first. */
export const EveryAccount: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    const cards = within(
      await canvas.findByRole("list", { name: "Petty-cash accounts" }),
    );
    const ravi = cards.getByRole("button", { name: /Ravi Kumar/ });
    await expect(ravi).toHaveAttribute("aria-pressed", "true");
    await expect(ravi).toHaveTextContent("₹4,250.00");
    await expect(ravi).toHaveTextContent("Pending -₹1,200.00 (2)");
    await expect(
      cards.getByRole("button", { name: /Meena S/ }),
    ).toHaveTextContent("-₹350.00");
    // The table on wide screens, the list on phones: one of them shows.
    await expect(
      first(await canvas.findAllByText("PC/26-27/00012")),
    ).toBeInTheDocument();
    await expect(
      first(canvas.getAllByText("To Company's Cash Account")),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/4 vouchers · Payments ₹1,000.00 · Receipts ₹2,000.00/),
    ).toBeVisible();

    // Another holder's account.
    await userEvent.click(cards.getByRole("button", { name: /Meena S/ }));
    await expect(
      await canvas.findByRole("heading", { name: "Petty cash — Meena S" }),
    ).toBeVisible();
    await expect(
      await canvas.findByText("No vouchers on this Project"),
    ).toBeVisible();
  },
};

/** Without View all: only the viewer's own account; no approval, no export. */
export const OwnAccountOnly: Story = {
  beforeEach: serve({
    accounts: [RAVI_ACCOUNT],
    viewAll: false,
    flags: ["read", "create", "update"],
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Your petty cash. Balances count approved vouchers only.",
      ),
    ).toBeVisible();
    const cards = within(
      canvas.getByRole("list", { name: "Petty-cash accounts" }),
    );
    await expect(cards.getAllByRole("listitem")).toHaveLength(1);
    await expect(
      canvas.queryByRole("button", { name: "Bulk approval" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Export Receipts" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "New voucher" }),
    ).toBeVisible();
  },
};

/** A member who holds no account is told to ask for one. */
export const NoAccountOfMyOwn: Story = {
  beforeEach: serve({ accounts: [], viewAll: false, flags: ["read"] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("You hold no petty-cash account"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Ask your accountant to open one for you."),
    ).toBeVisible();
  },
};

/** No accounts yet: open one for a Team Member. */
export const OpenFirstAccount: Story = {
  beforeEach: serve({ accounts: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("No petty-cash accounts yet"),
    ).toBeVisible();
    await userEvent.click(
      first(canvas.getAllByRole("button", { name: "Open account" })),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Open petty-cash account" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Open account" }));
    await expect(
      await dialog.findByText("Choose the Team Member"),
    ).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Team Member"));
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Kumar" }),
    );
    await userEvent.type(dialog.getByLabelText("Opening balance"), "5000");
    await userEvent.click(dialog.getByRole("button", { name: "Open account" }));
    await waitFor(async () => {
      await expect(posted("/petty-cash/accounts")).toHaveLength(1);
    });
    await expect(posted("/petty-cash/accounts")[0]?.body).toMatchObject({
      holderMemberId: "0199a000-0000-7000-8000-0000000000a1",
      openingBalance: 5_000_00,
      name: null,
    });
    await expect(
      await canvas.findByRole("list", { name: "Petty-cash accounts" }),
    ).toBeVisible();
  },
};

/** Bulk approval: tick pending vouchers, approve them all at once. */
export const BulkApprove: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText("PC/26-27/00012");
    await userEvent.click(
      canvas.getByRole("button", { name: "Bulk approval" }),
    );
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select PC/26-27/00012" })),
    );
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select PC/26-27/00010" })),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (2)" }));
    await expect(await canvas.findByText("2 vouchers approved.")).toBeVisible();
    await expect(posted("/bulk-approve")[0]?.body).toEqual({
      ids: [
        "0199a000-0000-7000-8000-0000000c0012",
        "0199a000-0000-7000-8000-0000000c0010",
      ],
    });
  },
};

/** The server refuses a bulk approval: nothing changes, and it says so. */
export const BulkRefused: Story = {
  beforeEach: serve({ refuseBulk: true }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findAllByText("PC/26-27/00012");
    await userEvent.click(
      canvas.getByRole("button", { name: "Bulk approval" }),
    );
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select PC/26-27/00012" })),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await expect(
      await canvas.findByText(
        "One of them cannot be decided; nothing was changed.",
      ),
    ).toBeVisible();
  },
};

/** An unused account can be closed. */
export const CloseUnusedAccount: Story = {
  beforeEach: serve({ accounts: [EMPTY_ACCOUNT, MEENA_ACCOUNT], vouchers: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Close account" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("alertdialog", {
        name: "Close Petty cash — Suresh P?",
      }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Close account" }),
    );
    await waitFor(async () => {
      await expect(
        canvas.queryByRole("button", { name: /Suresh P/ }),
      ).toBeNull();
    });
  },
};

/** Mobile: cards stack, vouchers become a list; nothing scrolls sideways. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Vouchers" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};

/** Export Receipts: a date range, then a ZIP link for that account. */
export const ExportReceipts: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Export Receipts" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Export Receipts" }),
    );
    const from = dialog.getByLabelText("From");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-10-01");
    const to = dialog.getByLabelText("To");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-10-10");
    await expect(
      dialog.getByRole("link", { name: "Download ZIP" }),
    ).toHaveAttribute(
      "href",
      `/api/construction/finance/petty-cash/accounts/${RAVI_ACCOUNT.id}/receipts.zip?from=2026-10-01&to=2026-10-10`,
    );
  },
};
