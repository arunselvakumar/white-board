import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  EARTHWORK,
  EXCAVATION,
  FILLING,
  PCC,
  PROJECT,
  QUANTITY_CHANGE,
  RATE_CHANGE,
  UOM_CUM,
} from "./boq-fixtures";
import { BOQ_API, postCount, posted, serveBoq } from "./boq-stories-api";
import { VariationDialog } from "./variation-dialog";

const meta = {
  title: "Contracts/BOQ/Variation dialog",
  component: VariationDialog,
  args: {
    projectId: PROJECT,
    financial: true,
    items: [EXCAVATION, FILLING, PCC],
    variation: null,
    onClose: fn(),
  },
  render: (args) => (
    <StoryQueries>
      <VariationDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VariationDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const created = () =>
  serveBoq({
    write: (call) =>
      call.path === `${BOQ_API}/variations`
        ? Response.json(QUANTITY_CHANGE, { status: 201 })
        : undefined,
  });

async function openDialog(canvasElement: HTMLElement) {
  const body = within(canvasElement.ownerDocument.body);
  return {
    body,
    dialog: within(
      await body.findByRole("dialog", { name: "Raise a Variation" }),
    ),
  };
}

const quantity = created();

/** A quantity change: pick the item, see its figures, give the new quantity and a reason. */
export const QuantityChange: Story = {
  beforeEach: quantity.beforeEach,
  play: async ({ args, canvasElement, userEvent }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await expect(await dialog.findByText("Pick the BOQ item")).toBeVisible();
    await expect(dialog.getByText("Write why the BOQ changes")).toBeVisible();
    await expect(postCount(quantity.holder.current)).toBe(0);
    await userEvent.type(
      dialog.getByRole("combobox", { name: "BOQ item" }),
      "excav",
    );
    const list = within(
      await body.findByRole("listbox", { name: "BOQ items" }),
    );
    await userEvent.click(
      await list.findByRole("option", { name: /^1\.1 · / }),
    );
    await expect(
      dialog.getByText(/Original 450 cum at ₹285\.50; now 520 cum/),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("New quantity"), "540");
    await userEvent.type(dialog.getByLabelText("Reason"), "Measured at JMR");
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(
      posted(quantity.holder.current, `${BOQ_API}/variations`),
    ).toEqual({
      projectId: PROJECT,
      kind: "quantity",
      reason: "Measured at JMR",
      boqItemId: EXCAVATION.id,
      newQuantity: "540",
    });
  },
};

const rate = created();

/** A rate change, prefilled with the item from its row. */
export const RateChange: Story = {
  args: { prefill: { kind: "rate", boqItemId: PCC.id } },
  beforeEach: rate.beforeEach,
  play: async ({ args, canvasElement, userEvent }) => {
    const { dialog } = await openDialog(canvasElement);
    await expect(dialog.getByLabelText("What changes")).toHaveTextContent(
      "Rate change",
    );
    await userEvent.type(dialog.getByLabelText("New rate"), "6400");
    await userEvent.type(dialog.getByLabelText("Reason"), "Cement price rose");
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted(rate.holder.current, `${BOQ_API}/variations`)).toEqual({
      projectId: PROJECT,
      kind: "rate",
      reason: "Cement price rose",
      boqItemId: PCC.id,
      newRate: 6_400_00,
    });
  },
};

const extra = created();

/** An extra item: where it goes and what it adds. */
export const ExtraItem: Story = {
  beforeEach: extra.beforeEach,
  play: async ({ args, canvasElement, userEvent }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await userEvent.click(dialog.getByLabelText("What changes"));
    await userEvent.click(
      await body.findByRole("option", { name: "Extra item" }),
    );
    await userEvent.type(dialog.getByLabelText("Item no"), "1.9");
    await userEvent.type(
      dialog.getByLabelText("Description"),
      "Sump excavation",
    );
    await userEvent.click(dialog.getByLabelText("UoM"));
    await userEvent.click(await body.findByRole("option", { name: "cum" }));
    await userEvent.type(dialog.getByLabelText("Quantity"), "40");
    await userEvent.type(dialog.getByLabelText("Rate"), "1000");
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Client asked for a sump",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted(extra.holder.current, `${BOQ_API}/variations`)).toEqual(
      {
        projectId: PROJECT,
        kind: "extra_item",
        reason: "Client asked for a sump",
        sectionId: EARTHWORK,
        itemNo: "1.9",
        description: "Sump excavation",
        uomId: UOM_CUM,
        sacHsn: null,
        newQuantity: "40",
        newRate: 1000_00,
      },
    );
  },
};

const quantitiesOnly = created();

/** Without Financial only a quantity change is offered. */
export const WithoutFinancial: Story = {
  args: { financial: false },
  beforeEach: quantitiesOnly.beforeEach,
  play: async ({ canvasElement, userEvent }) => {
    const { body, dialog } = await openDialog(canvasElement);
    await userEvent.click(dialog.getByLabelText("What changes"));
    await expect(
      await body.findByRole("option", { name: "Quantity change" }),
    ).toBeVisible();
    await expect(
      body.queryByRole("option", { name: "Rate change" }),
    ).toBeNull();
    await expect(body.queryByRole("option", { name: "Extra item" })).toBeNull();
  },
};

const edit = serveBoq({
  write: (call) =>
    call.path.endsWith("/update")
      ? Response.json({ ...RATE_CHANGE, newRate: 320_00 })
      : undefined,
});

/** Editing a pending one keeps its kind and sends `expectedUpdatedAt`. */
export const EditPending: Story = {
  args: { variation: RATE_CHANGE },
  beforeEach: edit.beforeEach,
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", {
        name: `Edit Variation ${RATE_CHANGE.number}`,
      }),
    );
    const rateField = dialog.getByLabelText("New rate");
    await expect(rateField).toHaveValue("310");
    await userEvent.clear(rateField);
    await userEvent.type(rateField, "320");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(
      posted(
        edit.holder.current,
        `${BOQ_API}/variations/${RATE_CHANGE.id}/update`,
      ),
    ).toEqual({
      reason: RATE_CHANGE.reason,
      boqItemId: EXCAVATION.id,
      newRate: 320_00,
      expectedUpdatedAt: RATE_CHANGE.updatedAt,
    });
  },
};
