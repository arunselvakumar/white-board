import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  sentTo,
  StoryQueryClient,
} from "@/components/designations/designation-story-support";

import { LookupNameDialog } from "./lookup-name-dialog";
import { DEPARTMENTS_SCREEN, LABOUR_CATEGORIES_SCREEN } from "./lookup-screens";
import {
  serveMasters,
  STORY_DEPARTMENTS,
  STORY_LABOUR_CATEGORIES,
} from "./masters-story-support";

const CATEGORIES = "/api/construction/masters/labour-categories";
const DEPARTMENTS = "/api/construction/masters/departments";

let api: ReturnType<typeof serveMasters>;

const meta = {
  title: "Masters/Labour Categories/Form",
  component: LookupNameDialog,
  args: {
    config: LABOUR_CATEGORIES_SCREEN,
    item: null,
    onClose: fn(),
  },
  render: (args) => (
    <StoryQueryClient>
      <LookupNameDialog {...args} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = serveMasters({
      base: CATEGORIES,
      code: "LABOUR_CATEGORY",
      initial: STORY_LABOUR_CATEGORIES,
    });
    return api.restore;
  },
} satisfies Meta<typeof LookupNameDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddValidatesAndSaves: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Add Labour Category" }),
      ).toBeVisible(),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Labour Category name"),
    ).toBeVisible();
    await expect(api.spy).not.toHaveBeenCalled();

    await userEvent.type(
      dialog.getByLabelText("Labour Category name"),
      "x".repeat(101),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Use at most 100 characters"),
    ).toBeVisible();

    await userEvent.clear(dialog.getByLabelText("Labour Category name"));
    await userEvent.type(
      dialog.getByLabelText("Labour Category name"),
      "  Bar Bender II ",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(sentTo(api.spy, CATEGORIES)).toEqual({
      name: "Bar Bender II",
    });
  },
};

export const NameInUse: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(
      dialog.getByLabelText("Labour Category name"),
      "mason",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("A row with this name already exists."),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Labour Category name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

const BAR_BENDER = STORY_LABOUR_CATEGORIES.find(
  (item) => item.name === "Bar Bender",
);

export const RenameSendsLoadedUpdatedAt: Story = {
  args: { item: BAR_BENDER ?? null },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Rename Bar Bender" }),
      ).toBeVisible(),
    );
    const field = dialog.getByLabelText("Labour Category name");
    await userEvent.clear(field);
    await userEvent.type(field, "Steel Fixer");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(sentTo(api.spy, `${String(BAR_BENDER?.id)}/update`)).toEqual({
      name: "Steel Fixer",
      expectedUpdatedAt: BAR_BENDER?.updatedAt,
    });
  },
};

export const AddDepartment: Story = {
  args: { config: DEPARTMENTS_SCREEN },
  beforeEach: () => {
    api = serveMasters({
      base: DEPARTMENTS,
      code: "DEPARTMENT",
      initial: STORY_DEPARTMENTS,
    });
    return api.restore;
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Department name"), "rcc");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("A row with this name already exists."),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Department name"));
    await userEvent.type(dialog.getByLabelText("Department name"), "Glazing");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
  },
};
