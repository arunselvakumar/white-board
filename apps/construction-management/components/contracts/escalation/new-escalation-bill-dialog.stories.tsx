import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { DRAFT, FORM_OPTIONS, PREVIEW, PROJECT } from "./escalation-fixtures";
import { NewEscalationBillDialog } from "./new-escalation-bill-dialog";

const API = "/api/construction/contracts/escalation-bills";

let api: ReturnType<typeof mockApi>;

/** The body of the last POST to `path`. */
function posted(path: string): unknown {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path)
    .at(-1)?.body;
}

function serve(preview: () => Response) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path.startsWith(`${API}/form-options`))
        return Response.json(FORM_OPTIONS);
      if (call.method === "GET" && call.path.startsWith(`${API}/preview`))
        return preview();
      if (call.method === "POST" && call.path === API)
        return Response.json(DRAFT, { status: 201 });
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Contracts/Escalation/New escalation bill",
  component: NewEscalationBillDialog,
  args: {
    projectId: PROJECT,
    side: "contractor",
    open: true,
    onOpenChange: () => undefined,
  },
  render: (args) => (
    <StoryQueries>
      <NewEscalationBillDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewEscalationBillDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function pick(userEvent: {
  click: (e: Element) => Promise<void>;
  type: (e: Element, t: string) => Promise<void>;
}) {
  const dialog = within(document.body).getByRole("dialog");
  await userEvent.click(await within(dialog).findByLabelText("Work Order"));
  await userEvent.click(
    await within(document.body).findByRole("option", {
      name: /WO\/26-27\/00003/,
    }),
  );
  await userEvent.type(within(dialog).getByLabelText("From month"), "2026-04");
  await userEvent.type(within(dialog).getByLabelText("To month"), "2026-06");
  return dialog;
}

/** R and the running bills it takes, then the escalation, before drafting. */
export const ShowsR: Story = {
  beforeEach: serve(() => Response.json(PREVIEW)),
  play: async ({ userEvent }) => {
    const dialog = await pick(userEvent);
    await expect(
      await within(dialog).findByText(/R = ₹10,00,000.00/),
    ).toBeVisible();
    const bills = within(dialog).getByRole("list", {
      name: "Running bills taken",
    });
    await expect(within(bills).getAllByRole("listitem")).toHaveLength(2);
    await expect(within(dialog).getByText("₹21,250.00")).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Draft escalation bill" }),
    );
    await waitFor(async () => {
      await expect(posted(API)).toMatchObject({
        fromMonth: "2026-04",
        toMonth: "2026-06",
      });
    });
  },
};

/** A missing index says which series and month, and nothing can be drafted. */
export const MissingIndex: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "PRICE_INDEX_MISSING",
        message:
          "There is no CPI-IW index for Jun 2026. Add it under Master records → Price indices.",
        details: { series: "CPI-IW", month: "2026-06-01" },
      },
      { status: 400 },
    ),
  ),
  play: async ({ userEvent }) => {
    const dialog = await pick(userEvent);
    await expect(
      await within(dialog).findByText(/no CPI-IW index for Jun 2026/),
    ).toBeVisible();
    await expect(
      within(dialog).getByRole("button", { name: "Draft escalation bill" }),
    ).toBeDisabled();
  },
};
