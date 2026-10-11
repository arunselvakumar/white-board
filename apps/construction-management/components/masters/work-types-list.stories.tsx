import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { chooseFromMenu } from "./masters-story-support";
import { workTypesHandler } from "./work-type-fixtures";
import { WorkTypesList } from "./work-types-list";

let api: ReturnType<typeof mockApi>;

function serve(options: Parameters<typeof workTypesHandler>[0] = {}) {
  return () => {
    api = mockApi(workTypesHandler(options));
    return api.restore;
  };
}

function posted(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(path));
}

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

const meta = {
  title: "Masters/Work Types/List",
  component: WorkTypesList,
  parameters: { layout: "fullscreen" },
  render: () => (
    <StoryQueries>
      <WorkTypesList />
    </StoryQueries>
  ),
} satisfies Meta<typeof WorkTypesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The RCC default, Company Work Types with their Department and Materials. */
export const WithWorkTypes: Story = {
  beforeEach: serve({ inUse: ["Column casting"] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Work Types" });
    await expect(
      within(rowNamed(list, "RCC")).getByText("Default"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Column casting")).getByText("RCC · 2 Materials"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Pipe laying")).getByText("Disabled"),
    ).toBeVisible();

    // Search matches the Department too.
    await userEvent.type(canvas.getByLabelText("Search Work Types"), "plumb");
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(canvas.getByLabelText("Search Work Types"));

    // The Default row is edited and disabled, never deleted.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for RCC" }),
    );
    const disable = await body.findByRole("menuitem", { name: "Disable" });
    await waitFor(() => expect(disable).toBeVisible());
    await expect(body.getByRole("menuitem", { name: "Edit" })).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(disable);
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await waitFor(() =>
      expect(within(rowNamed(list, "RCC")).getByText("Disabled")).toBeVisible(),
    );
    await expect(posted("/disable")).toHaveLength(1);

    // A Work Type a worksheet uses is not deleted; the reason shows.
    await chooseFromMenu(canvasElement, userEvent, "Column casting", "Delete");
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Column casting?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(
      await confirm.findByText(
        "Daily Worksheets use this Work Type, so it cannot be deleted. Disable it instead.",
      ),
    ).toBeVisible();
  },
};

/** A Company Work Type no worksheet uses is deleted after asking. */
export const DeleteAsksFirst: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Work Types" });
    await chooseFromMenu(canvasElement, userEvent, "Brick work", "Delete");
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Brick work?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(within(list).queryByText("Brick work")).toBeNull(),
    );
  },
};

/** A Company without Work Types: the empty state offers Add. */
export const Empty: Story = {
  beforeEach: serve({ initial: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(await canvas.findByText("No Work Types yet")).toBeVisible();
    const add = canvas.getAllByRole("button", { name: "Add Work Type" });
    await expect(add).toHaveLength(2);
    const inEmptyState = add.at(-1);
    if (inEmptyState == null) throw new Error("No Add button");
    await userEvent.click(inEmptyState);
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("heading", {
        name: "Add Work Type",
      }),
    ).toBeVisible();
  },
};

/** Mobile: rows wrap without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Work Types" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
