import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { chooseFromMenu } from "./masters-story-support";
import {
  STORY_ISSUE_CATEGORIES,
  STORY_TAGS,
  trackingMastersHandler,
} from "./tracking-master-fixtures";
import { IssueCategoriesList, TagsList } from "./tracking-master-lists";

let api: ReturnType<typeof mockApi>;

/** A fresh in-memory API on every run, so a re-run starts from `initial`. */
function serve(handler: () => (call: ApiCall) => Response | undefined) {
  return () => {
    api = mockApi(handler());
    return api.restore;
  };
}

const categories = (
  options: Partial<Parameters<typeof trackingMastersHandler>[0]> = {},
) =>
  serve(() =>
    trackingMastersHandler({
      list: "issue-categories",
      initial: STORY_ISSUE_CATEGORIES,
      ...options,
    }),
  );

const tags = (
  options: Partial<Parameters<typeof trackingMastersHandler>[0]> = {},
) =>
  serve(() =>
    trackingMastersHandler({ list: "tags", initial: STORY_TAGS, ...options }),
  );

function posted(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(path));
}

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.textContent.startsWith(name));
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

const meta = {
  title: "Masters/Tracking masters",
  component: IssueCategoriesList,
  parameters: { layout: "fullscreen" },
  render: () => (
    <StoryQueries>
      <IssueCategoriesList />
    </StoryQueries>
  ),
} satisfies Meta<typeof IssueCategoriesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Defaults, a disabled one and two in use; a Default can be disabled. */
export const IssueCategories: Story = {
  beforeEach: categories(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Issue Categories" });
    await expect(
      within(rowNamed(list, "Design")).getByText("Default"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "RFI")).getByText("Disabled"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Quality")).getByText("Used on issues"),
    ).toBeVisible();

    await userEvent.type(
      canvas.getByLabelText("Search Issue Categories"),
      "qual",
    );
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(canvas.getByLabelText("Search Issue Categories"));

    // A Default in use: Rename and Disable, no Delete.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Quality" }),
    );
    const disable = await body.findByRole("menuitem", { name: "Disable" });
    await waitFor(() => expect(disable).toBeVisible());
    await expect(body.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(disable);
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await waitFor(() =>
      expect(
        within(rowNamed(list, "Quality")).getByText("Disabled"),
      ).toBeVisible(),
    );
    await expect(posted("/disable")).toHaveLength(1);
  },
};

/** Add: empty is refused on the spot, a taken name under the field. */
export const AddIssueCategory: Story = {
  beforeEach: categories(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Issue Categories" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Issue Category" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Issue Category" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(await dialog.findByText("Enter the name")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Name"), "safety");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText(
        "An Issue Category with this name already exists.",
      ),
    ).toBeVisible();
    const name = dialog.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Electrical");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(await canvas.findByText("Electrical")).toBeVisible();
  },
};

/** A Default is renamed with the `updatedAt` it was loaded with. */
export const RenameDefault: Story = {
  beforeEach: categories(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Issue Categories" });
    await chooseFromMenu(canvasElement, userEvent, "Design", "Rename");
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename Design" }),
    );
    const name = dialog.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Design & drawings");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await within(list).findByText("Design & drawings"),
    ).toBeVisible();
    await expect(posted("/update").at(-1)?.body).toEqual({
      name: "Design & drawings",
      expectedUpdatedAt: "2026-10-14T06:30:00.000Z",
    });
  },
};

/** Tags: no Disable; an unused tag is deleted after asking. */
export const Tags: Story = {
  beforeEach: tags(),
  render: () => (
    <StoryQueries>
      <TagsList />
    </StoryQueries>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Tags" });
    await expect(
      within(rowNamed(list, "Critical path")).getByText("On tasks"),
    ).toBeVisible();
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Critical path" }),
    );
    await body.findByRole("menuitem", { name: "Rename" });
    await expect(body.queryByRole("menuitem", { name: "Disable" })).toBeNull();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());

    await chooseFromMenu(canvasElement, userEvent, "Monsoon work", "Delete");
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Monsoon work?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(within(list).queryByText("Monsoon work")).toBeNull(),
    );
  },
};

/** No tags yet: the empty state offers Add. */
export const TagsEmpty: Story = {
  beforeEach: tags({ initial: [] }),
  render: () => (
    <StoryQueries>
      <TagsList />
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Tags yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Tag" }),
    ).toHaveLength(2);
  },
};

/** Read only: no Add and no row actions. */
export const ReadOnly: Story = {
  beforeEach: categories({
    can: { create: false, update: false, delete: false },
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Issue Categories" });
    await expect(
      canvas.queryByRole("button", { name: "Add Issue Category" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
    // Read-only rows still say which categories issues use.
    await expect(canvas.getAllByText("Used on issues")).toHaveLength(2);
  },
};

/** Mobile: rows wrap without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: categories(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Issue Categories" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
