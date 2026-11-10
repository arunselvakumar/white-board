import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import type { OtherExpense } from "@/src/queries/finance-other-expenses";

import { mockFinanceDocumentApi } from "../documents/finance-document-fixtures";
import {
  AUTO_EXPENSE,
  financeAccessHandler,
  PROJECT_ID,
  TEA_EXPENSE,
} from "./other-expense-fixtures";
import { OtherExpenseDetail } from "./other-expense-detail";

const API = "/api/construction/finance/other-expenses";

let api: ReturnType<typeof mockApi>;

function posted(path: string): ApiCall | undefined {
  return api.calls.mock.calls
    .map(([call]) => call)
    .find((call) => call.method === "POST" && call.path === path);
}

/**
 * Answers the expense and its thread. A POST answered by `write` with an
 * expense becomes what the next read returns.
 */
function serve(
  expense: OtherExpense,
  write: (call: ApiCall) => OtherExpense | Response | undefined = () =>
    undefined,
) {
  return () => {
    let current = expense;
    const documents = mockFinanceDocumentApi();
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === `${API}/${expense.id}`)
        return Response.json(current);
      if (call.method === "POST" && call.path.startsWith(API)) {
        const answer = write(call);
        if (answer == null || answer instanceof Response) return answer;
        current = answer;
        return Response.json(answer);
      }
      return financeAccessHandler(call) ?? documents(call);
    });
    return api.restore;
  };
}

const meta = {
  title: "Finance/Other Expenses/Detail",
  component: OtherExpenseDetail,
  args: { projectId: PROJECT_ID, id: TEA_EXPENSE.id },
  render: (args) => (
    <StoryQueries>
      <OtherExpenseDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof OtherExpenseDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pending expense: its figures, files and remarks, and Approve. */
export const ApprovePending: Story = {
  beforeEach: serve(TEA_EXPENSE, (call) =>
    call.path === `${API}/${TEA_EXPENSE.id}/approve`
      ? {
          ...TEA_EXPENSE,
          status: "approved",
          decidedBy: { id: "user-owner", name: "Arun Selva Kumar" },
          actions: { edit: true, delete: true, approve: false, reject: false },
        }
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "EXP/26-27/00001" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Pending approval: it moves no money until it is approved.",
      ),
    ).toBeVisible();
    await expect(canvas.getByText("Tea for the slab pour crew")).toBeVisible();
    await expect(
      await canvas.findByRole("heading", { name: "Remarks" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(posted(`${API}/${TEA_EXPENSE.id}/approve`)?.body).toEqual({
        expectedUpdatedAt: TEA_EXPENSE.updatedAt,
      }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull(),
    );
  },
};

/** Reject asks for a reason. */
export const RejectWithReason: Story = {
  beforeEach: serve(TEA_EXPENSE, (call) =>
    call.path === `${API}/${TEA_EXPENSE.id}/reject`
      ? { ...AUTO_EXPENSE, id: TEA_EXPENSE.id }
      : undefined,
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reject" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByRole("textbox"), "No bill attached");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(posted(`${API}/${TEA_EXPENSE.id}/reject`)?.body).toEqual({
        reason: "No bill attached",
        expectedUpdatedAt: TEA_EXPENSE.updatedAt,
      }),
    );
  },
};

/** A rejected expense shows who rejected it and why. */
export const Rejected: Story = {
  args: { id: AUTO_EXPENSE.id },
  beforeEach: serve(AUTO_EXPENSE),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Rejected by Arun Selva Kumar: No bill attached/),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(canvas.getByRole("link", { name: "Edit" })).toBeVisible();
  },
};

/** The server refuses an approval in a closed period; the page says why. */
export const ApproveRefused: Story = {
  beforeEach: serve(TEA_EXPENSE, () =>
    Response.json(
      {
        code: "FINANCIAL_PERIOD_CLOSED",
        message:
          "The books are closed up to 2026-10-10. Entries dated on or before it cannot be approved or rejected.",
      },
      { status: 403 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve" }),
    );
    await expect(
      await canvas.findByText(/The books are closed up to 2026-10-10/),
    ).toBeVisible();
  },
};
