import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import {
  MaterialCategoriesList,
  MaterialsList,
  MeasurementUnitsList,
  TermsConditionsList,
} from "./material-master-lists";
import {
  STORY_CATEGORIES,
  STORY_CIVIL,
  calledWith,
  lastBody,
  serveMaterialMasters,
} from "./material-masters-story-support";
import { chooseFromMenu } from "./masters-story-support";

let api: ReturnType<typeof serveMaterialMasters>;

function serve(...args: Parameters<typeof serveMaterialMasters>) {
  return () => {
    api = serveMaterialMasters(...args);
    return api.restore;
  };
}

const meta = {
  title: "Masters/Materials/Lists",
  component: MeasurementUnitsList,
  render: () => (
    <StoryQueryClient>
      <MeasurementUnitsList />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof MeasurementUnitsList>;

export default meta;
type Story = StoryObj<typeof meta>;

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (row == null) throw new Error(`No row ${name}`);
  return row;
}

const UNITS = "/api/construction/masters/measurement-units";

export const Units: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Measurement Units" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    await expect(canvas.getByText("5 Measurement Units")).toBeVisible();
    await expect(
      within(rowNamed(list, "Bag")).getByText("Default"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "sqft")).getByText("Disabled"),
    ).toBeVisible();

    // A seed unit only disables.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Bag" }),
    );
    const disable = await body.findByRole("menuitem", { name: "Disable" });
    await waitFor(() => expect(disable).toBeVisible());
    await expect(body.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.click(disable);
    await waitFor(() =>
      expect(within(rowNamed(list, "Bag")).getByText("Disabled")).toBeVisible(),
    );

    // Search and the state filter go to the server.
    await userEvent.type(
      canvas.getByLabelText("Search Measurement Units"),
      "k",
    );
    await waitFor(() =>
      expect(calledWith(api.spy, UNITS, { q: "k" })).toBe(true),
    );
    await waitFor(() =>
      expect(
        within(canvas.getByRole("list", { name: "Measurement Units" }))
          .getAllByRole("listitem")
          .map((row) => row.querySelector("p")?.textContent),
      ).toEqual(["kg"]),
    );
    await userEvent.clear(canvas.getByLabelText("Search Measurement Units"));
    await userEvent.click(canvas.getByRole("button", { name: "Disabled" }));
    await waitFor(() =>
      expect(calledWith(api.spy, UNITS, { status: "disabled" })).toBe(true),
    );
  },
};

export const AddAndRenameUnit: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Measurement Units" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Measurement Unit" }),
    );
    const dialog = await body.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Unit name"), "bag");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(
      await within(dialog).findByText("One with this name already exists."),
    ).toBeVisible();
    await userEvent.clear(within(dialog).getByLabelText("Unit name"));
    await userEvent.type(within(dialog).getByLabelText("Unit name"), "Coil");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(lastBody(api.spy, UNITS)).toEqual({ name: "Coil" });
    await expect(await canvas.findByText("Coil")).toBeVisible();

    await chooseFromMenu(canvasElement, userEvent, "Running metre", "Rename");
    const rename = await body.findByRole("dialog");
    await expect(within(rename).getByLabelText("Unit name")).toHaveValue(
      "Running metre",
    );
  },
};

export const DeleteUnitInUse: Story = {
  beforeEach: serve({}, { inUse: ["Running metre"] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Measurement Units" });
    await chooseFromMenu(canvasElement, userEvent, "Running metre", "Delete");
    const dialog = await body.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(
        "Materials use this, so it cannot be deleted. Disable it instead.",
      ),
    ).toBeVisible();
  },
};

export const NoUnits: Story = {
  beforeEach: serve({ units: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Measurement Units yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Measurement Unit" }),
    ).toHaveLength(2);
  },
};

const CATEGORIES = "/api/construction/masters/material-categories";

export const Categories: Story = {
  beforeEach: serve(),
  render: () => (
    <StoryQueryClient>
      <MaterialCategoriesList />
    </StoryQueryClient>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", {
      name: "Material Categories",
    });
    await expect(
      within(rowNamed(list, "Cement")).getByText("Under Civil Work Materials"),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Civil Work Materials")).getByText(
        "1 sub-category",
      ),
    ).toBeVisible();

    // Add a sub-category under a top-level parent.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Material Category" }),
    );
    const dialog = await body.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Category name"),
      "Primers",
    );
    await userEvent.click(within(dialog).getByLabelText("Parent category"));
    const options = await body.findByRole("listbox", {
      name: "Parent categories",
    });
    // Only top-level, enabled categories are offered.
    await expect(within(options).queryByText("Cement")).toBeNull();
    await userEvent.click(
      within(options).getByRole("option", { name: "Colour & Paints" }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(lastBody(api.spy, CATEGORIES)).toEqual({
      name: "Primers",
      parentId: STORY_CATEGORIES[1]?.id,
    });
    await expect(
      await canvas.findByText("Under Colour & Paints"),
    ).toBeVisible();
  },
};

export const CategoryWithChildrenStaysTopLevel: Story = {
  beforeEach: serve({
    categories: [
      {
        ...STORY_CIVIL,
        isSeed: false,
      },
      ...STORY_CATEGORIES.slice(1),
    ],
  }),
  render: () => (
    <StoryQueryClient>
      <MaterialCategoriesList />
    </StoryQueryClient>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("list", { name: "Material Categories" });
    await chooseFromMenu(
      canvasElement,
      userEvent,
      "Civil Work Materials",
      "Edit",
    );
    const dialog = await body.findByRole("dialog");
    await expect(
      within(dialog).getByText("It has sub-categories, so it stays top-level."),
    ).toBeVisible();
  },
};

const TERMS = "/api/construction/masters/terms-conditions";

export const TermsAndConditions: Story = {
  beforeEach: serve(),
  render: () => (
    <StoryQueryClient>
      <TermsConditionsList />
    </StoryQueryClient>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", {
      name: "Terms & Conditions",
    });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await expect(
      within(rowNamed(list, "Payment")).getByText(
        "30 days from the Goods Receipt.",
      ),
    ).toBeVisible();

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Terms & Conditions" }),
    );
    const dialog = await body.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(
      await within(dialog).findByText("Enter the title"),
    ).toBeVisible();
    await userEvent.type(within(dialog).getByLabelText("Title"), "Warranty");
    await userEvent.type(
      within(dialog).getByLabelText("Terms"),
      "12 months from delivery.",
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(lastBody(api.spy, TERMS)).toEqual({
      title: "Warranty",
      body: "12 months from delivery.",
    });
  },
};

export const NoTerms: Story = {
  beforeEach: serve({ terms: [] }),
  render: () => (
    <StoryQueryClient>
      <TermsConditionsList />
    </StoryQueryClient>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Terms & Conditions yet"),
    ).toBeVisible();
  },
};

const MATERIALS = "/api/construction/masters/materials";

export const Materials: Story = {
  beforeEach: serve(),
  render: () => (
    <StoryQueryClient>
      <MaterialsList />
    </StoryQueryClient>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Materials" });
    const cement = rowNamed(list, "Cement OPC 53");
    await expect(
      within(cement).getByText(
        "UltraTech, 50 kg · Bag · Civil Work Materials · Consumable · ₹385.00 / Bag · GST 28% · HSN 2523",
      ),
    ).toBeVisible();
    await expect(
      within(rowNamed(list, "Concrete Mixer")).getByText("Disabled"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Material" }),
    ).toHaveAttribute("href", "/app/masters/materials/new");

    // Filters go to the server.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Item Type" }));
    await userEvent.click(await body.findByRole("option", { name: "Asset" }));
    await waitFor(() =>
      expect(calledWith(api.spy, MATERIALS, { itemType: "asset" })).toBe(true),
    );
    await waitFor(() =>
      expect(
        within(canvas.getByRole("list", { name: "Materials" }))
          .getAllByRole("listitem")
          .map((row) => row.querySelector("p")?.textContent),
      ).toEqual(["Concrete Mixer"]),
    );
  },
};

export const NoMaterials: Story = {
  beforeEach: serve({ materials: [] }),
  render: () => (
    <StoryQueryClient>
      <MaterialsList />
    </StoryQueryClient>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Materials yet")).toBeVisible();
  },
};
