import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { EditMaterialScreen, NewMaterialScreen } from "./material-form";
import {
  STORY_CATEGORIES,
  STORY_CEMENT,
  STORY_UNITS,
  lastBody,
  serveMaterialMasters,
} from "./material-masters-story-support";

let api: ReturnType<typeof serveMaterialMasters>;

function serve(...args: Parameters<typeof serveMaterialMasters>) {
  return () => {
    api = serveMaterialMasters(...args);
    return api.restore;
  };
}

const MATERIALS = "/api/construction/masters/materials";
const CEMENT = STORY_CEMENT;

const meta = {
  title: "Masters/Materials/Form",
  component: NewMaterialScreen,
  render: () => (
    <StoryQueryClient>
      <NewMaterialScreen />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof NewMaterialScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

async function choose(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  label: string,
  option: string,
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByLabelText(label));
  const item = await body.findByRole("option", { name: option });
  await waitFor(() => expect(item).toBeVisible());
  await userEvent.click(item);
  await waitFor(() => expect(body.queryByRole("listbox")).toBeNull());
}

export const AddWithRateDetails: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Add Material" });
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Material name"),
    ).toBeVisible();
    await expect(canvas.getByText("Choose the Measurement Unit")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Material name"), "Cement PPC");
    await userEvent.type(
      canvas.getByLabelText("Specification"),
      "Dalmia, 50 kg bag",
    );
    await choose(canvasElement, userEvent, "Measurement Unit", "Bag");
    // Disabled units are not offered.
    await userEvent.click(canvas.getByLabelText("Measurement Unit"));
    const body = within(canvasElement.ownerDocument.body);
    const units = await body.findByRole("listbox", {
      name: "Measurement Units",
    });
    await expect(within(units).queryByText("sqft")).toBeNull();
    await userEvent.keyboard("{Escape}");
    await choose(
      canvasElement,
      userEvent,
      "Material Category",
      "Civil Work Materials › Cement",
    );

    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Minimum Stock" }),
    );
    await userEvent.type(
      canvas.getByLabelText("Minimum quantity at each location"),
      "25.5",
    );
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Rate Details" }),
    );
    await userEvent.type(canvas.getByLabelText("Unit rate"), "360");
    await userEvent.type(canvas.getByLabelText("Discount"), "2.5");
    await userEvent.type(canvas.getByLabelText("GST rate (%)"), "18");
    await userEvent.type(canvas.getByLabelText("HSN code"), "252");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Enter 4 to 8 digits")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("HSN code"), "3");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/materials"),
    );
    await expect(lastBody(api.spy, MATERIALS)).toEqual({
      name: "Cement PPC",
      specification: "Dalmia, 50 kg bag",
      uomId: STORY_UNITS[0]?.id,
      categoryId: STORY_CATEGORIES[3]?.id,
      itemType: "consumable",
      minStockQty: "25.5",
      unitRate: 36_000,
      discount: { type: "percent", percent: "2.5" },
      gstRate: "18",
      hsnCode: "2523",
    });
  },
};

export const AddWithoutFinancial: Story = {
  beforeEach: serve({}, { financial: false }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Add Material" });
    await expect(
      canvas.queryByRole("checkbox", { name: "Rate Details" }),
    ).toBeNull();
    await userEvent.type(canvas.getByLabelText("Material name"), "M Sand");
    await choose(canvasElement, userEvent, "Measurement Unit", "cum");
    await choose(canvasElement, userEvent, "Item Type", "Non-consumable");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(lastBody(api.spy, MATERIALS)).toEqual({
        name: "M Sand",
        specification: null,
        uomId: STORY_UNITS[2]?.id,
        categoryId: null,
        itemType: "non_consumable",
        minStockQty: null,
      }),
    );
  },
};

export const NameInUse: Story = {
  beforeEach: serve(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Add Material" });
    await userEvent.type(
      canvas.getByLabelText("Material name"),
      "cement opc 53",
    );
    await choose(canvasElement, userEvent, "Measurement Unit", "Bag");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("One with this name already exists."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Material name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const Edit: Story = {
  beforeEach: serve(),
  render: () => (
    <StoryQueryClient>
      <EditMaterialScreen id={CEMENT.id} />
    </StoryQueryClient>
  ),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "Edit Cement OPC 53" });
    await expect(canvas.getByLabelText("Material name")).toHaveValue(
      "Cement OPC 53",
    );
    await expect(
      canvas.getByRole("checkbox", { name: "Rate Details" }),
    ).toBeChecked();
    await expect(canvas.getByLabelText("Unit rate")).toHaveValue("385");
    await expect(canvas.getByLabelText("GST rate (%)")).toHaveValue("28");
    await expect(
      canvas.getByLabelText("Minimum quantity at each location"),
    ).toHaveValue("50");
    // Turning Rate Details off clears them.
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Rate Details" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(lastBody(api.spy, `${MATERIALS}/${CEMENT.id}/update`)).toEqual(
        expect.objectContaining({
          name: "Cement OPC 53",
          unitRate: null,
          discount: null,
          gstRate: null,
          hsnCode: null,
          minStockQty: "50",
          expectedUpdatedAt: CEMENT.updatedAt,
        }),
      ),
    );
  },
};
