import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import {
  CLAUSE_VIEW,
  LOCKED_CLAUSE,
  NO_CLAUSE,
  PROJECT,
  WORK_ORDER,
} from "./escalation-fixtures";
import { EscalationClausePanel } from "./escalation-clause-panel";
import type { EscalationClauseView } from "@/src/queries/contracts-escalation";

let api: ReturnType<typeof mockApi>;

function serve(view: EscalationClauseView) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path.endsWith("/escalation-clause"))
        return Response.json(view);
      if (
        call.method === "POST" &&
        call.path === "/api/construction/contracts/escalation-clauses"
      )
        return Response.json(
          {
            code: "ESCALATION_WEIGHTS_NOT_100",
            message:
              "The weights add up to 80.00 %; they must add up to 100 %.",
            details: { field: "components", total: "80.00" },
          },
          { status: 400 },
        );
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Contracts/Escalation/Clause panel",
  component: EscalationClausePanel,
  args: { scope: { projectId: PROJECT, workOrderId: WORK_ORDER } },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-3xl p-4">
        <EscalationClausePanel {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof EscalationClausePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No clause: adding one shows the running weight total and the server's refusal. */
export const AddClause: Story = {
  beforeEach: serve(NO_CLAUSE),
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText(/at fixed rates/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add clause" }));
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Base month"),
      "2026-01",
    );
    const weights = within(dialog).getAllByLabelText("Weight %");
    await userEvent.type(weights[0]!, "30");
    await userEvent.type(weights[1]!, "50");
    await expect(
      within(dialog).getByText(/Weights add up to 80 %/),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save clause" }),
    );
    await expect(
      await within(dialog).findByText(/must add up to 100 %\.$/),
    ).toBeVisible();
    await expect(api.calls).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({
          workOrderId: WORK_ORDER,
          baseMonth: "2026-01",
        }),
      }),
    );
  },
};

/** A clause with a 10CA cement component at its base price. */
export const WithCement: Story = {
  beforeEach: serve(CLAUSE_VIEW),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", { name: "Components" });
    await expect(
      within(list).getByText(/10CA at ₹7,000.00 a unit/),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Edit" })).toBeVisible();
  },
};

/** An approved escalation bill locks it: no Edit or Remove. */
export const Locked: Story = {
  beforeEach: serve(LOCKED_CLAUSE),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Locked: 1 approved escalation bill uses it/),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Edit" })).toBeNull();
  },
};
