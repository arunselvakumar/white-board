import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  HINDRANCE_PROJECT_ID,
  mockHindranceApi,
  type HindranceApiOptions,
} from "./hindrance-fixtures";
import { HindrancesList } from "./hindrances-list";

function hindranceApi(options: HindranceApiOptions = {}) {
  return () => mockHindranceApi(options).restore;
}

const BASE = `/app/projects/${HINDRANCE_PROJECT_ID}/hindrances`;

const meta = {
  title: "Site work/Hindrances/List",
  component: HindrancesList,
  args: { projectId: HINDRANCE_PROJECT_ID },
  beforeEach: hindranceApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <HindrancesList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof HindrancesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each hindrance with its status, cause, party and time lost. */
export const Register: Story = {
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Hindrances" }),
    );
    const items = list.getAllByRole("listitem");
    await expect(items).toHaveLength(2);
    const [first, second] = items;
    if (first == null || second == null) throw new Error("two hindrances");
    const open = within(first);
    await expect(
      open.getByRole("link", { name: "HR/26-27/00003" }),
    ).toHaveAttribute("href", `${BASE}/0199c4a0-0000-7000-8000-0000000f1001`);
    await expect(open.getByText("Open")).toBeVisible();
    await expect(
      open.getByText("Labour shortage · Contractor · Velan Constructions"),
    ).toBeVisible();
    await expect(
      open.getByText(/continuing · 4 days so far · 16.5 hours/),
    ).toBeVisible();
    const closed = within(second);
    await expect(closed.getByText("Closed")).toBeVisible();
    await expect(closed.getByText(/3 days$/)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Record hindrance" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** Filters by status and cause. */
export const Filters: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Hindrances" });
    await userEvent.click(canvas.getByRole("tab", { name: /^Closed/ }));
    await waitFor(async () => {
      await expect(
        within(canvas.getByRole("list", { name: "Hindrances" })).getAllByRole(
          "listitem",
        ),
      ).toHaveLength(1);
    });
    await userEvent.click(canvas.getByRole("combobox", { name: "Cause" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Material shortage",
      }),
    );
    await expect(await canvas.findByText("No hindrances match")).toBeVisible();
  },
};

/** An empty register offers Record hindrance to members with Create. */
export const Empty: Story = {
  beforeEach: hindranceApi({ hindrances: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No hindrances recorded"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Record hindrance" }),
    ).toHaveLength(2);
  },
};

/** Without Create there is nothing to record from. */
export const ReadOnly: Story = {
  beforeEach: hindranceApi({
    hindrances: [],
    flags: { "site_work.hindrances": ["read"] },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No hindrances recorded"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Record hindrance" }),
    ).toBeNull();
  },
};
