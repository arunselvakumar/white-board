import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  AMENDED,
  CEMENT,
  CONTRACTOR,
  CUM,
  EXCAVATION,
  PCC,
  PROJECT,
  REJECTED,
  WO_ISSUED,
  workOrderOf,
} from "./work-order-fixtures";
import { WorkOrderForm } from "./work-order-form";
import {
  posted,
  serveWorkOrders,
  WORK_ORDERS_API,
} from "./work-order-stories-api";

const meta = {
  title: "Contracts/Work Orders/Form",
  component: WorkOrderForm,
  args: {
    projectId: PROJECT,
    workOrder: null,
    mode: "create",
    today: "2026-10-22",
  },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT}/work-orders/new` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <WorkOrderForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof WorkOrderForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const fresh = serveWorkOrders();

/**
 * A new draft: the Contractor brings its TDS nature; two BOQ items come in
 * at once at what is left and their BOQ rate; ordering PCC when the BOQ has
 * none left warns but still saves; a Material's coefficient comes from the
 * PCC item's rate analysis.
 */
export const NewWithBoqLines: Story = {
  beforeEach: fresh.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByLabelText("Contractor"));
    await userEvent.click(
      await body.findByRole("option", { name: "Velan Constructions" }),
    );
    await expect(canvas.getByLabelText("TDS nature")).toHaveTextContent(
      "Contractor / labour supply",
    );
    await userEvent.type(canvas.getByLabelText("Retention % per bill"), "5");

    await userEvent.click(canvas.getByRole("button", { name: "Add from BOQ" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Add from BOQ" }),
    );
    await expect(
      dialog.getByText("Nothing left after other Work Orders"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /^1\.1 · Excavation/ }),
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /^2\.1 · PCC/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add 2 items" }));

    await expect(canvas.getByLabelText("Line 1 quantity")).toHaveValue("250");
    await expect(canvas.getByLabelText("Line 1 rate")).toHaveValue("450");
    await expect(canvas.getByLabelText("Line 2 quantity")).toHaveValue("");
    await userEvent.type(canvas.getByLabelText("Line 2 quantity"), "12");
    await expect(
      await canvas.findByText("More than the BOQ has left"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        /BOQ item 2\.1: ordering 12 cum, the BOQ has nothing left/,
      ),
    ).toBeVisible();
    // 250 × ₹450 + 12 × ₹5,200 = ₹1,74,900.
    await expect(canvas.getByText(/^Total ₹1,74,900\.00/)).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: /Materials issued/ }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Material" }));
    const picker = canvas.getByRole("combobox", { name: "Material 1" });
    await userEvent.type(picker, "cem");
    await userEvent.click(
      await within(
        await body.findByRole("listbox", { name: "Materials" }),
      ).findByRole("option", { name: /^Cement OPC 53/ }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText(/^2\.1 · PCC/)).toHaveValue("3.4"),
    );
    await expect(canvas.getByLabelText(/^1\.1 · Excavation/)).toHaveValue("");

    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(posted(fresh.holder.current, WORK_ORDERS_API)).toMatchObject({
        projectId: PROJECT,
        contractorId: CONTRACTOR,
        orderDate: "2026-10-22",
        terms: {
          retentionPercent: "5",
          tdsNature: "contractor",
          gstRate: "18",
        },
        lines: [
          {
            kind: "boq",
            boqItemId: EXCAVATION,
            quantity: "250",
            rate: 450_00,
            uomId: CUM,
          },
          { kind: "boq", boqItemId: PCC, quantity: "12", rate: 5200_00 },
        ],
        materials: [
          {
            materialId: CEMENT,
            issueBasis: "free",
            coefficients: [
              { line: 0, coefficient: null },
              { line: 1, coefficient: "3.4" },
            ],
          },
        ],
      }),
    );
  },
};

const blank = serveWorkOrders();

/** Saving an empty form names what is missing; nothing is sent. */
export const Validation: Story = {
  beforeEach: blank.beforeEach,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add line" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await expect(await canvas.findByText("Pick the Contractor")).toBeVisible();
    await expect(canvas.getByText("Enter the description")).toBeVisible();
    await expect(canvas.getByText("Pick the UoM")).toBeVisible();
    await expect(canvas.getByText("Enter the rate")).toBeVisible();
    await expect(posted(blank.holder.current, WORK_ORDERS_API)).toBeUndefined();
  },
};

const quantities = serveWorkOrders({ financial: false });

/** Without Financial: no rates, amounts, total or advance; the server keeps the rates. */
export const WithoutFinancial: Story = {
  beforeEach: quantities.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText(/Rates and totals need the Work Order/),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("Mobilisation advance")).toBeNull();
    await userEvent.click(canvas.getByLabelText("Contractor"));
    await userEvent.click(
      await body.findByRole("option", { name: "Sri Murugan Labour Supply" }),
    );
    await expect(canvas.getByLabelText("TDS nature")).toHaveTextContent(
      "No TDS",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add from BOQ" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Add from BOQ" }),
    );
    await expect(dialog.queryByText(/₹/)).toBeNull();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /^3\.1 · 12 mm/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add 1 item" }));
    await expect(canvas.queryByLabelText("Line 1 rate")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }));
    await waitFor(async () => {
      const sent = posted(quantities.holder.current, WORK_ORDERS_API) as {
        lines: Record<string, unknown>[];
      };
      await expect(sent.lines[0]).toMatchObject({ quantity: "900" });
      await expect(sent.lines[0]).not.toHaveProperty("rate");
    });
  },
};

const amending = serveWorkOrders({ workOrder: workOrderOf() });

/** Amend an issued Work Order: the reason is asked for, then the amendment is sent. */
export const Amend: Story = {
  args: { workOrder: workOrderOf(), mode: "amend" },
  beforeEach: amending.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText("Amending an issued Work Order"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Contractor")).toBeDisabled();
    const quantity = canvas.getByLabelText("Line 1 quantity");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "1200");
    await userEvent.click(canvas.getByRole("button", { name: "Amend" }));
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Amend Work Order WO/26-27/00003?",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Amend" }));
    await expect(
      await dialog.findByText("Write why the Work Order changes."),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Why it is amended"),
      "Deeper excavation at the pump house",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Amend" }));
    await waitFor(() =>
      expect(
        posted(
          amending.holder.current,
          `${WORK_ORDERS_API}/${WO_ISSUED}/amend`,
        ),
      ).toMatchObject({
        reason: "Deeper excavation at the pump house",
        expectedUpdatedAt: AMENDED.updatedAt,
        lines: [
          expect.objectContaining({
            id: workOrderOf().lines[0]?.id,
            quantity: "1200",
          }),
          expect.objectContaining({ kind: "boq" }),
          expect.objectContaining({ kind: "non_boq" }),
        ],
      }),
    );
  },
};

const rejected = serveWorkOrders({ workOrder: REJECTED });

/** A rejected draft opens with the approver's reason. */
export const EditRejected: Story = {
  args: { workOrder: REJECTED, mode: "edit" },
  beforeEach: rejected.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Rejected")).toBeVisible();
    await expect(
      canvas.getByText(
        "The PCC rate is above the BOQ rate; check with the QS.",
      ),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save" })).toBeVisible();
  },
};
