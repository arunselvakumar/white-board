import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, mockApi } from "../../../.storybook/mocks/api";
import {
  SETTINGS_PROJECT_ID,
  salesSettingsHandler,
} from "./sales-settings-fixtures";
import { SalesListDialog } from "./sales-list-dialog";

let api: ReturnType<typeof mockApi>;

const meta = {
  title: "Sales/Inquiries/Settings/List dialog",
  component: SalesListDialog,
  args: {
    projectId: SETTINGS_PROJECT_ID,
    list: "lead_source",
    item: null,
    onClose: fn(),
  },
  beforeEach: () => {
    api = mockApi(salesSettingsHandler());
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <SalesListDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof SalesListDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Add a Lead Source: too long is refused on the spot, then it saves and closes. */
export const AddLeadSource: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add Lead Source" }),
    );
    await expect(dialog.getByText(/Where an inquiry came from/)).toBeVisible();
    const name = dialog.getByLabelText("Name");
    await userEvent.type(name, "x".repeat(61));
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText("Use at most 60 characters"),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Newspaper ad");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};

/** Rename a Lost Reason: the name is filled in. */
export const RenameLostReason: Story = {
  args: {
    list: "lost_reason",
    item: {
      id: "0199c4a0-0000-7000-8000-0000000f9999",
      name: "Budget",
      updatedAt: "2026-10-14T06:30:00.000Z",
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename Budget" }),
    );
    await expect(dialog.getByLabelText("Name")).toHaveValue("Budget");
    await expect(dialog.getByRole("button", { name: "Save" })).toBeVisible();
  },
};
