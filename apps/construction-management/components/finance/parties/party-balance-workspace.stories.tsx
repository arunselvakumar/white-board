import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { PartyBalanceWorkspace } from "./party-balance-workspace";
import { partyMoneyHandler } from "./party-fixtures";

const meta = {
  title: "Finance/Parties/Party Balance",
  component: PartyBalanceWorkspace,
  beforeEach: () => mockApi(partyMoneyHandler()).restore,
  render: () => (
    <StoryQueries>
      <PartyBalanceWorkspace />
    </StoryQueries>
  ),
} satisfies Meta<typeof PartyBalanceWorkspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each Other Party across Projects; a Project opens its statement. */
export const AcrossProjects: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Party balances" }),
    );
    await expect(list.getByText("₹7,000.00 owed to the Company")).toBeVisible();
    const projects = within(
      list.getByRole("list", { name: "Kumaran Consultants by Project" }),
    );
    await expect(projects.getByText("Tower B")).toBeVisible();
    await expect(projects.getByText("₹3,000.00")).toBeVisible();
    await expect(list.getByText("Not on any Project yet.")).toBeVisible();
    await userEvent.click(
      projects.getByRole("button", {
        name: "Statement of Kumaran Consultants on Tower A",
      }),
    );
    const sheet = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(await sheet.findByText("Statement on Tower A")).toBeVisible();
    await expect(
      await sheet.findByRole("list", { name: "Statement" }),
    ).toBeVisible();
  },
};

export const NoOtherParties: Story = {
  beforeEach: () =>
    mockApi(partyMoneyHandler(undefined, { empty: true })).restore,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Other Parties yet")).toBeVisible();
  },
};
