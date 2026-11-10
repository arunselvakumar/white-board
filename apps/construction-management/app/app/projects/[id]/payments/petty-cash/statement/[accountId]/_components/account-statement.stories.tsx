import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { StoryQueries, mockApi } from "../../../.storybook/mocks/api";
import { AccountStatementView } from "./account-statement";
import {
  RAVI_ACCOUNT,
  STORY_PROJECT_ID,
  STORY_STATEMENT,
  pettyCashHandler,
  type PettyCashApiOptions,
} from "./petty-cash-fixtures";

let api: ReturnType<typeof mockApi>;

function serve(options: PettyCashApiOptions = {}) {
  return () => {
    api = mockApi(pettyCashHandler(options));
    return api.restore;
  };
}

const meta = {
  title: "Finance/Petty Cash/Statement",
  component: AccountStatementView,
  args: {
    projectId: STORY_PROJECT_ID,
    accountId: RAVI_ACCOUNT.id,
    today: "2026-10-11",
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl">
        <AccountStatementView {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof AccountStatementView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opening, each approved entry with its running balance, closing. */
export const WithEntries: Story = {
  beforeEach: serve(),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", {
        name: "Statement · Petty cash — Ravi Kumar",
      }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("From")).toHaveValue("2026-10-01");
    await expect(await canvas.findByText("Opening")).toBeVisible();
    await expect(canvas.getAllByText("₹4,250.00").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("PC/26-27/00008").length).toBeGreaterThan(
      0,
    );
    const api_calls = api.calls.mock.calls.map(([call]) => call.path);
    await expect(api_calls).toContain(
      `/api/construction/finance/accounts/${RAVI_ACCOUNT.id}/statement?from=2026-10-01&to=2026-10-11`,
    );
  },
};

/** A period with no approved entries. */
export const Empty: Story = {
  beforeEach: serve({
    statement: {
      ...STORY_STATEMENT,
      opening: 0,
      entries: [],
      totalIn: 0,
      totalOut: 0,
      closing: 0,
    },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No entries between 1 Oct 2026 and 11 Oct 2026. Pending vouchers show once approved.",
      ),
    ).toBeVisible();
  },
};

/** Mobile: entries become cards; nothing scrolls sideways. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Statement" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
