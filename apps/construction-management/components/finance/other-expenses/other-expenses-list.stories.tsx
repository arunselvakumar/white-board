import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { financeLookupsHandler } from "../account-fixtures";
import {
  AUTO_EXPENSE,
  DIESEL_EXPENSE,
  expensePage,
  financeAccessHandler,
  PROJECT_ID,
  TEA_EXPENSE,
} from "./other-expense-fixtures";
import { OtherExpensesList } from "./other-expenses-list";

const API = "/api/construction/finance/other-expenses";

let api: ReturnType<typeof mockApi>;

function calls(method: string, prefix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.startsWith(prefix));
}

function serve(
  items = [TEA_EXPENSE, DIESEL_EXPENSE, AUTO_EXPENSE],
  write: (call: ApiCall) => Response | undefined = () => undefined,
) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === API) {
        const status = url.searchParams.get("status");
        return Response.json(
          expensePage(
            items.filter((item) => status == null || item.status === status),
          ),
        );
      }
      if (call.method === "POST") return write(call);
      return financeAccessHandler(call) ?? financeLookupsHandler(call);
    });
    return api.restore;
  };
}

const meta = {
  title: "Finance/Other Expenses/List",
  component: OtherExpensesList,
  args: { projectId: PROJECT_ID },
  render: (args) => (
    <StoryQueries>
      <OtherExpensesList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof OtherExpensesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each expense with its status, the totals, and the status filter. */
export const ListAndFilter: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("link", { name: "EXP/26-27/00001" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "3 expenses · ₹13,250.00 · Approved ₹12,500.00 · Pending ₹450.00",
      ),
    ).toBeVisible();
    await expect(canvas.getAllByText("Rejected").length).toBeGreaterThan(0);

    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await body.findByRole("option", { name: "Pending" }));
    await waitFor(() =>
      expect(calls("GET", API).at(-1)?.path).toBe(
        `${API}?projectId=${PROJECT_ID}&status=pending`,
      ),
    );
    await expect(
      await canvas.findByText(/^1 expense · ₹450\.00/),
    ).toBeVisible();
  },
};

/** Bulk approval: only pending expenses can be picked, and all go together. */
export const BulkApprove: Story = {
  beforeEach: serve(undefined, (call) =>
    call.path === `${API}/bulk-approve`
      ? Response.json({ decided: 1 })
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Select EXP/26-27/00002" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select EXP/26-27/00001" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await expect(await canvas.findByText("1 expense approved.")).toBeVisible();
    await expect(calls("POST", `${API}/bulk-approve`)[0]?.body).toEqual({
      projectId: PROJECT_ID,
      ids: [TEA_EXPENSE.id],
    });
  },
};

/** A refused bulk decision changes nothing and says why. */
export const BulkRefused: Story = {
  beforeEach: serve(undefined, () =>
    Response.json(
      {
        code: "BULK_DECISION_REFUSED",
        message: "One of them cannot be decided; nothing was changed.",
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Select EXP/26-27/00001" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await expect(
      await canvas.findByText(
        "One of them cannot be decided; nothing was changed.",
      ),
    ).toBeVisible();
  },
};

/** Nothing recorded yet: an empty state with Add. */
export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Other Expenses yet"),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.getAllByRole("link", { name: "Add Other Expense" }).length,
      ).toBe(2),
    );
  },
};
