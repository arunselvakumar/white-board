import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  CEMENT,
  FORM_OPTIONS,
  MATERIAL_OPTIONS,
  PCC,
  PLASTER,
  UOM_BAG,
  UOM_CUM,
  UOM_SQM,
} from "./item-fixtures";
import { EditItemScreen, NewItemScreen } from "./item-form";

const API = "/api/construction/contracts/items";

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown {
  return api.calls.mock.calls
    .map(([call]) => call)
    .find((call) => call.method === "POST" && call.path === path)?.body;
}

function posts(): number {
  return api.calls.mock.calls.filter(([call]) => call.method === "POST").length;
}

function serve(write: (call: ApiCall) => Response | undefined) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === `${API}/form-options`)
        return Response.json(FORM_OPTIONS);
      if (call.method === "GET" && url.pathname === `${API}/material-options`) {
        const search = url.searchParams.get("search")?.toLowerCase() ?? "";
        return Response.json({
          items: MATERIAL_OPTIONS.filter((option) =>
            option.name.toLowerCase().includes(search),
          ),
        });
      }
      if (call.method === "GET" && url.pathname === `${API}/${PCC.id}`)
        return Response.json(PCC);
      if (call.method === "GET" && url.pathname === `${API}/${PLASTER.id}`)
        return Response.json(PLASTER);
      if (call.method === "POST") return write(call);
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Item Library/Form",
  component: NewItemScreen,
  render: () => (
    <StoryQueries>
      <NewItemScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewItemScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Without a rate analysis: the fields are checked, then sent with no lines. */
export const AddWithoutAnalysis: Story = {
  beforeEach: serve((call) =>
    call.path === API ? Response.json(PLASTER, { status: 201 }) : undefined,
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Add Item" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(/No rate analysis\. Add the materials/),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Item's code"),
    ).toBeVisible();
    await expect(canvas.getByText("Enter a short description")).toBeVisible();
    await expect(canvas.getByText("Pick the UoM")).toBeVisible();
    await expect(canvas.getByText("Enter the adopted rate")).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(canvas.getByLabelText("Code"), "13.4.1");
    await userEvent.type(
      canvas.getByLabelText("Short description"),
      "12 mm cement plaster 1:6",
    );
    await userEvent.click(canvas.getByLabelText("UoM"));
    await userEvent.click(await body.findByRole("option", { name: "sqm" }));
    await userEvent.type(canvas.getByLabelText("SAC/HSN"), "99");
    await userEvent.type(
      canvas.getByLabelText("Schedule"),
      "TN PWD SoR 2025-26",
    );
    await userEvent.type(canvas.getByLabelText("Adopted rate"), "285");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("4 to 8 digits")).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("SAC/HSN"));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        "/app/masters/item-library",
      ),
    );
    await expect(posted(API)).toEqual({
      code: "13.4.1",
      shortDescription: "12 mm cement plaster 1:6",
      description: null,
      uomId: UOM_SQM,
      sacHsn: null,
      schedule: "TN PWD SoR 2025-26",
      adoptedRate: 28500,
      overheadPercent: null,
      lines: [],
    });
  },
};

/**
 * With a rate analysis: a Material line takes the Material's UoM and rate,
 * a lump sum needs a description, amounts and the analysed rate are worked
 * out as you type, and "Use analysed rate" fills the adopted rate.
 */
export const AddWithAnalysis: Story = {
  beforeEach: serve((call) =>
    call.path === API ? Response.json(PCC, { status: 201 }) : undefined,
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(await canvas.findByLabelText("Code"), "5.1.1");
    await userEvent.type(
      canvas.getByLabelText("Short description"),
      "PCC 1:4:8 in foundations",
    );
    await userEvent.click(canvas.getByLabelText("UoM"));
    await userEvent.click(await body.findByRole("option", { name: "cum" }));

    // A Material line: the new line's picker takes the focus.
    await userEvent.click(canvas.getByRole("button", { name: "Material" }));
    const picker = canvas.getByRole("combobox", { name: "Line 1 Material" });
    await waitFor(() => expect(picker).toHaveFocus());
    await userEvent.type(picker, "cem");
    const list = within(
      await body.findByRole("listbox", { name: "Materials" }),
    );
    await userEvent.click(
      await list.findByRole("option", { name: /^Cement OPC 53/ }),
    );
    await expect(canvas.getByLabelText("Line 1 rate")).toHaveValue("415.50");
    await expect(canvas.getByLabelText("Line 1 UoM")).toHaveTextContent("Bag");
    await userEvent.type(
      canvas.getByLabelText("Line 1 quantity per unit"),
      "0.45",
    );
    await expect(canvas.getByLabelText("Line 1 amount")).toHaveTextContent(
      "₹186.98",
    );

    // A lump sum from the keyboard: Enter on the button, then type.
    canvas.getByRole("button", { name: "Lump sum" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Line 2 description")).toHaveFocus(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Describe the lump sum"),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Line 2 description"), "Water");
    await userEvent.type(canvas.getByLabelText("Line 2 rate"), "10");
    await userEvent.type(canvas.getByLabelText("Overhead and profit %"), "15");
    // (186.98 + 10.00) × 1.15 = 226.527 → ₹226.53.
    const summary = canvas.getByRole("region", {
      name: "Analysed and adopted rate",
    });
    await expect(within(summary).getByText("₹226.53")).toBeVisible();
    await expect(
      within(summary).getByText("Enter the adopted rate to compare."),
    ).toBeVisible();
    await userEvent.click(
      within(summary).getByRole("button", { name: "Use analysed rate" }),
    );
    await expect(canvas.getByLabelText("Adopted rate")).toHaveValue("226.53");
    await expect(
      within(summary).getByText("The adopted rate matches the analysed rate."),
    ).toBeVisible();

    // A third line removed again with its named button.
    await userEvent.click(canvas.getByRole("button", { name: "Labour" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Line 3 (Labour)" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        "/app/masters/item-library",
      ),
    );
    await expect(posted(API)).toEqual({
      code: "5.1.1",
      shortDescription: "PCC 1:4:8 in foundations",
      description: null,
      uomId: UOM_CUM,
      sacHsn: null,
      schedule: null,
      adoptedRate: 22653,
      overheadPercent: "15",
      lines: [
        {
          kind: "material",
          materialId: CEMENT,
          labourCategoryId: null,
          equipmentId: null,
          description: null,
          coefficient: "0.45",
          resourceUomId: UOM_BAG,
          rate: 41550,
        },
        {
          kind: "lump_sum",
          materialId: null,
          labourCategoryId: null,
          equipmentId: null,
          description: "Water",
          coefficient: "1",
          resourceUomId: null,
          rate: 1000,
        },
      ],
    });
  },
};

/**
 * Edit loads the Item's lines with their amounts and shows the adopted rate
 * above the analysed one; the save sends `expectedUpdatedAt`.
 */
export const EditWithAnalysis: Story = {
  render: () => (
    <StoryQueries>
      <EditItemScreen id={PCC.id} />
    </StoryQueries>
  ),
  beforeEach: serve((call) =>
    call.path === `${API}/${PCC.id}/update` ? Response.json(PCC) : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit 5.1.1" }),
    ).toBeVisible();
    const lines = canvas.getByRole("list", { name: "Rate analysis lines" });
    await expect(within(lines).getAllByRole("listitem")).toHaveLength(4);
    await expect(
      canvas.getByRole("combobox", { name: "Line 2 Labour Category" }),
    ).toHaveValue("Mason");
    await expect(canvas.getByLabelText("Line 3 amount")).toHaveTextContent(
      "₹250.00",
    );
    const summary = canvas.getByRole("region", {
      name: "Analysed and adopted rate",
    });
    await expect(within(summary).getByText("₹623.28")).toBeVisible();
    await expect(
      within(summary).getByText(
        "The adopted rate is ₹26.72 (4.29 %) above the analysed rate.",
      ),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Line 4 (Lump sum)" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted(`${API}/${PCC.id}/update`)).toMatchObject({
        code: "5.1.1",
        adoptedRate: 65000,
        overheadPercent: "15",
        expectedUpdatedAt: PCC.updatedAt,
      }),
    );
    const sent = posted(`${API}/${PCC.id}/update`) as { lines: unknown[] };
    await expect(sent.lines).toHaveLength(3);
  },
};

/** A line the server refuses shows its message under that line's field. */
export const ServerLineError: Story = {
  render: () => (
    <StoryQueries>
      <EditItemScreen id={PCC.id} />
    </StoryQueries>
  ),
  beforeEach: serve(() =>
    Response.json(
      {
        code: "ANALYSIS_MATERIAL_INVALID",
        message: "Pick a Material from Master records → Materials.",
        details: { line: 0, field: "lines.0.materialId" },
      },
      { status: 400 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "Pick a Material from Master records → Materials.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Line 1 Material" }),
    ).toHaveAttribute("aria-invalid", "true");
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};
