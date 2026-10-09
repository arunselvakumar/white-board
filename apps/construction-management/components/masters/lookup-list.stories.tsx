import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  calledPath,
  StoryQueryClient,
} from "@/components/designations/designation-story-support";

import { DepartmentsList, LabourCategoriesList } from "./lookup-list";
import {
  chooseFromMenu,
  serveMasters,
  STORY_DEPARTMENTS,
  STORY_LABOUR_CATEGORIES,
} from "./masters-story-support";

const CATEGORIES = "/api/construction/masters/labour-categories";
const DEPARTMENTS = "/api/construction/masters/departments";

let api: ReturnType<typeof serveMasters>;

function serveCategories(initial = STORY_LABOUR_CATEGORIES) {
  return () => {
    api = serveMasters({
      base: CATEGORIES,
      code: "LABOUR_CATEGORY",
      initial,
      inUse: ["Painter"],
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Labour Categories/List",
  component: LabourCategoriesList,
  render: () => (
    <StoryQueryClient>
      <LabourCategoriesList />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof LabourCategoriesList>;

export default meta;
type Story = StoryObj<typeof meta>;

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

export const WithCategories: Story = {
  beforeEach: serveCategories(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Labour Categories" });
    const rows = within(list).getAllByRole("listitem");
    await expect(
      rows.map((row) => row.querySelector("p")?.textContent),
    ).toEqual([
      "Bar Bender",
      "Carpenter",
      "Electrician",
      "Helper",
      "Mason",
      "Painter",
    ]);
    const mason = rowNamed(list, "Mason");
    await expect(within(mason).getByText("Default")).toBeVisible();
    const electrician = rowNamed(list, "Electrician");
    await expect(within(electrician).getByText("Disabled")).toBeVisible();
    await expect(electrician).toHaveAttribute("data-disabled");
    await expect(
      within(rowNamed(list, "Bar Bender")).queryByText("Default"),
    ).toBeNull();

    await userEvent.type(
      canvas.getByLabelText("Search Labour Categories"),
      "er",
    );
    await expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    await userEvent.clear(canvas.getByLabelText("Search Labour Categories"));

    // A Default row offers Disable only; it cannot be renamed or deleted.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Mason" }),
    );
    const disable = await body.findByRole("menuitem", { name: "Disable" });
    await waitFor(() => expect(disable).toBeVisible());
    await expect(body.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(disable);
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
    await waitFor(() =>
      expect(
        within(rowNamed(list, "Mason")).getByText("Disabled"),
      ).toBeVisible(),
    );
    await expect(calledPath(api.spy, "/disable")).toBe(true);

    await chooseFromMenu(canvasElement, userEvent, "Electrician", "Enable");
    await waitFor(() =>
      expect(
        within(rowNamed(list, "Electrician")).queryByText("Disabled"),
      ).toBeNull(),
    );

    // A Company row renames in a dialog.
    await chooseFromMenu(canvasElement, userEvent, "Bar Bender", "Rename");
    const dialog = await body.findByRole("dialog");
    await expect(
      within(dialog).getByLabelText("Labour Category name"),
    ).toHaveValue("Bar Bender");
  },
};

export const DeleteAsksFirst: Story = {
  beforeEach: serveCategories(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await chooseFromMenu(canvasElement, userEvent, "Painter", "Delete");
    const dialog = await body.findByRole("alertdialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "Delete Painter?" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(
        "Labours, Vendors or attendance use this, so it cannot be deleted. Disable it instead.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    await chooseFromMenu(canvasElement, userEvent, "Bar Bender", "Delete");
    await userEvent.click(
      within(await body.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(canvas.queryByText("Bar Bender")).not.toBeInTheDocument(),
    );
  },
};

export const Empty: Story = {
  beforeEach: serveCategories([]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("No Labour Categories yet"),
    ).toBeVisible();
    const buttons = canvas.getAllByRole("button", {
      name: "Add Labour Category",
    });
    await expect(buttons).toHaveLength(2);
    await expect(
      canvas.queryByLabelText("Search Labour Categories"),
    ).not.toBeInTheDocument();
    const [, emptyAdd] = buttons;
    if (emptyAdd == null) throw new Error("No Add in the empty state");
    await userEvent.click(emptyAdd);
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await waitFor(() =>
      expect(
        dialog.getByRole("heading", { name: "Add Labour Category" }),
      ).toBeVisible(),
    );
  },
};

export const Departments: Story = {
  beforeEach: () => {
    api = serveMasters({
      base: DEPARTMENTS,
      code: "DEPARTMENT",
      initial: STORY_DEPARTMENTS,
    });
    return api.restore;
  },
  render: () => (
    <StoryQueryClient>
      <DepartmentsList />
    </StoryQueryClient>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Departments" }),
    ).toBeVisible();
    const list = await canvas.findByRole("list", { name: "Departments" });
    await expect(
      within(list)
        .getAllByRole("listitem")
        .map((row) => row.querySelector("p")?.textContent),
    ).toEqual(["Fencing", "Masonry & Plaster", "Plumbing", "RCC"]);
    await expect(
      canvas.getByRole("button", { name: "Add Department" }),
    ).toBeVisible();
  },
};

export const DepartmentsEmpty: Story = {
  beforeEach: () => {
    api = serveMasters({ base: DEPARTMENTS, code: "DEPARTMENT", initial: [] });
    return api.restore;
  },
  render: () => (
    <StoryQueryClient>
      <DepartmentsList />
    </StoryQueryClient>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Departments yet")).toBeVisible();
  },
};
