import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  SETTINGS_PROJECT_ID,
  salesSettingsHandler,
  storySettings,
} from "./sales-settings-fixtures";
import { SalesSettingsPage } from "./sales-settings";

let api: ReturnType<typeof mockApi>;

function serve(settings = storySettings()) {
  return () => {
    api = mockApi(salesSettingsHandler(settings));
    return api.restore;
  };
}

function posted(suffix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(suffix));
}

function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent ?? "");
}

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

const meta = {
  title: "Sales/Inquiries/Settings",
  component: SalesSettingsPage,
  args: { projectId: SETTINGS_PROJECT_ID },
  parameters: { layout: "fullscreen" },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <SalesSettingsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof SalesSettingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The three lists: stages in order with their open inquiries, badges, usage. */
export const Lists: Story = {
  play: async ({ canvas }) => {
    const stages = await canvas.findByRole("list", { name: "Funnel Stages" });
    await expect(names(stages)).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
    await expect(
      within(rowNamed(stages, "New")).getByText("4 open inquiries"),
    ).toBeVisible();
    await expect(
      within(rowNamed(stages, "Site Visit")).getByText("No open inquiries"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Move New up" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Move Negotiation down" }),
    ).toBeDisabled();
    const sources = canvas.getByRole("list", { name: "Lead Sources" });
    await expect(
      within(rowNamed(sources, "Hoarding")).getByText("Disabled"),
    ).toBeVisible();
    await expect(
      within(rowNamed(sources, "Walk-in")).getByText("Used on 6 inquiries"),
    ).toBeVisible();
    const reasons = canvas.getByRole("list", { name: "Lost Reasons" });
    await expect(
      within(rowNamed(reasons, "Wants ready to move")).queryByText("Default"),
    ).toBeNull();
  },
};

/** Up and down move a stage one place and keep focus on the arrow. */
export const ReorderStages: Story = {
  play: async ({ canvas, userEvent }) => {
    const stages = await canvas.findByRole("list", { name: "Funnel Stages" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Move Site Visit up" }),
    );
    await waitFor(() =>
      expect(names(stages)).toEqual([
        "New",
        "Site Visit",
        "Contacted",
        "Negotiation",
      ]),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Move Site Visit up" }),
      ).toHaveFocus(),
    );
    await expect(posted("/move").at(-1)?.body).toEqual({ direction: "up" });
    // At the top, focus goes to the other arrow.
    await userEvent.click(
      canvas.getByRole("button", { name: "Move Site Visit up" }),
    );
    await waitFor(() => expect(names(stages)[0]).toBe("Site Visit"));
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: "Move Site Visit down" }),
      ).toHaveFocus(),
    );
  },
};

/** Add a stage (it goes last); a taken name shows under the field. */
export const AddStage: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const stages = await canvas.findByRole("list", { name: "Funnel Stages" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Funnel Stage" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Funnel Stage" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(await dialog.findByText("Enter the name")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Name"), "site visit");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText(
        "A row with this name already exists in this Project.",
      ),
    ).toBeVisible();
    const name = dialog.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Token paid");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(names(stages).at(-1)).toBe("Token paid"));
    await expect(posted("/funnel-stages").at(-1)?.body).toEqual({
      projectId: SETTINGS_PROJECT_ID,
      name: "Token paid",
    });
  },
};

/** A stage with open inquiries offers no Delete; an empty one is deleted. */
export const DeleteStage: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const stages = await canvas.findByRole("list", { name: "Funnel Stages" });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for New" }),
    );
    await body.findByRole("menuitem", { name: "Rename" });
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Negotiation" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Negotiation?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(names(stages)).toEqual(["New", "Contacted", "Site Visit"]),
    );
  },
};

/** Disable and enable a Lead Source; rename a Lost Reason. */
export const DisableAndRename: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const sources = await canvas.findByRole("list", { name: "Lead Sources" });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Website" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Disable" }),
    );
    await waitFor(() =>
      expect(
        within(rowNamed(sources, "Website")).getByText("Disabled"),
      ).toBeVisible(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Hoarding" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Enable" }),
    );
    await waitFor(() =>
      expect(
        within(rowNamed(sources, "Hoarding")).queryByText("Disabled"),
      ).toBeNull(),
    );
    // A source in use offers no Delete.
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Walk-in" }),
    );
    await body.findByRole("menuitem", { name: "Rename" });
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Budget" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Rename" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename Budget" }),
    );
    const name = dialog.getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Over budget");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Over budget")).toBeVisible();
    await expect(posted("/update").at(-1)?.body).toEqual({
      name: "Over budget",
      expectedUpdatedAt: "2026-10-14T06:30:00.000Z",
    });
  },
};

/** Without Inquiry Update: the lists only, no Add, arrows or menus. */
export const ReadOnly: Story = {
  beforeEach: serve(storySettings({ canManage: false })),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Funnel Stages" });
    await expect(canvas.queryByRole("button", { name: /^Add / })).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Move / })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for / }),
    ).toBeNull();
    await expect(
      canvas.getByText(/Ask someone with Inquiry update/),
    ).toBeVisible();
  },
};

/** No Lead Sources or Lost Reasons left: each list says so and offers Add. */
export const EmptyLists: Story = {
  beforeEach: serve(storySettings({ leadSources: [], lostReasons: [] })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Lead Sources")).toBeVisible();
    await expect(canvas.getByText("No Lost Reasons")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Lead Source" }).length,
    ).toBeGreaterThan(0);
  },
};
