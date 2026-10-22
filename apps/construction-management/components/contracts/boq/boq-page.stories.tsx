import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  boqOf,
  CONCRETE,
  EXCAVATION,
  FILLING,
  PCC,
  PROJECT,
  QUANTITY_CHANGE,
  RATE_CHANGE,
} from "./boq-fixtures";
import { BoqPage } from "./boq-page";
import { BOQ_API, postCount, posted, serveBoq } from "./boq-stories-api";

const meta = {
  title: "Contracts/BOQ/Page",
  component: BoqPage,
  args: { projectId: PROJECT },
  render: (args) => (
    <StoryQueries>
      <BoqPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BoqPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The section group in view (the table from md up, the cards below). */
async function shown(
  canvas: { findAllByLabelText: (text: string) => Promise<HTMLElement[]> },
  label: string,
): Promise<HTMLElement> {
  const found = (await canvas.findAllByLabelText(label)).find((element) =>
    element.checkVisibility(),
  );
  if (found == null) throw new Error(`${label} is not shown`);
  return found;
}

const empty = serveBoq({ boq: boqOf({ empty: true }) });

/** No sections yet: add the first one or import the whole BOQ. */
export const EmptyBoq: Story = {
  beforeEach: empty.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("No BOQ yet")).toBeVisible();
    await expect(canvas.getByText("₹0.00")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Sample" })).toHaveAttribute(
      "href",
      `${BOQ_API}/sample?projectId=${PROJECT}`,
    );
    await expect(canvas.queryByRole("link", { name: "Export" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Add item" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Add section" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Add section" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText("Enter the section's title"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Title"), "Earthwork");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(posted(empty.holder.current, `${BOQ_API}/sections`)).toEqual({
        projectId: PROJECT,
        title: "Earthwork",
      }),
    );
  },
};

const full = serveBoq();

/**
 * Sections as collapsible groups with their items, the measured badge,
 * subtotals and the total beside the Order Value with the difference.
 */
export const WithSections: Story = {
  beforeEach: full.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const total = within(await canvas.findByLabelText("BOQ total"));
    await expect(total.getByText("₹3,77,172.13")).toBeVisible();
    await expect(total.getByText("₹4,00,000.00")).toBeVisible();
    await expect(total.getByText("−₹22,827.87")).toBeVisible();
    await expect(canvas.getByText("₹1,78,160.00")).toBeVisible();

    const earth = within(await shown(canvas, "Earthwork items"));
    await expect(earth.getByText(EXCAVATION.description)).toBeVisible();
    await expect(earth.getAllByText("Measured")).toHaveLength(2);
    await expect(earth.getByText("VAR/26-27/00002 pending")).toBeVisible();
    await expect(earth.getByText("₹1,48,460.00")).toBeVisible();

    // A group folds away.
    await userEvent.click(
      canvas.getByRole("button", { name: /^Concrete work/ }),
    );
    await waitFor(() =>
      expect(
        canvas
          .queryAllByLabelText("Concrete work items")
          .filter((element) => element.checkVisibility()),
      ).toHaveLength(0),
    );

    // Move a section from its menu.
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Concrete work" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Move up" }),
    );
    await waitFor(() =>
      expect(
        posted(full.holder.current, `${BOQ_API}/sections/${CONCRETE}/move`),
      ).toEqual({
        direction: "up",
      }),
    );
  },
};

const phone = serveBoq();

/** At phone width items are cards and the page never scrolls sideways. */
export const PhoneWidth: Story = {
  beforeEach: phone.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const cards = within(await shown(canvas, "Earthwork items"));
    await expect(cards.getByText("₹1,48,460.00")).toBeVisible();
    await expect(cards.getByText("was 450")).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

const quantities = serveBoq({ boq: boqOf({ financial: false }) });

/** Without Financial: quantities only, and no Excel (it carries rates). */
export const WithoutFinancial: Story = {
  beforeEach: quantities.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Rates, amounts and totals need/),
    ).toBeVisible();
    await expect(canvas.queryByLabelText("BOQ total")).toBeNull();
    const earth = within(await shown(canvas, "Earthwork items"));
    await expect(earth.getByText("520")).toBeVisible();
    await expect(earth.queryByText("Rate")).toBeNull();
    await expect(earth.queryByText(/₹/)).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Sample" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Import" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Export" })).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Add item" }),
    ).toBeVisible();
  },
};

const viewer = serveBoq({ boq: boqOf({ flags: ["read", "financial"] }) });

/** A viewer with Read: no actions anywhere. */
export const ReadOnly: Story = {
  beforeEach: viewer.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("BOQ total")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add section" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Add item" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Actions for Earthwork" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: `Actions for item ${PCC.itemNo}` }),
    ).toBeNull();
  },
};

const decide = serveBoq({
  write: (call) =>
    call.path.endsWith("/reject") || call.path.endsWith("/approve")
      ? Response.json({ ...RATE_CHANGE, status: "approved" })
      : undefined,
});

/** Variations: approve one, reject another with a reason. */
export const ApproveAndReject: Story = {
  beforeEach: decide.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Variations" }),
    );
    const list = within(
      await canvas.findByRole("list", { name: "Variations" }),
    );
    await expect(list.getByText("₹285.50 → ₹310.00")).toBeVisible();
    await expect(list.getByText("180 → 240 cum")).toBeVisible();
    await expect(list.getByText("40 cum at ₹1,000.00")).toBeVisible();
    const [rate, quantity] = list.getAllByRole("listitem");
    if (rate == null || quantity == null) throw new Error("No Variations");
    await userEvent.click(
      within(rate).getByRole("button", { name: "Approve" }),
    );
    await waitFor(() =>
      expect(
        posted(
          decide.holder.current,
          `${BOQ_API}/variations/${RATE_CHANGE.id}/approve`,
        ),
      ).toEqual({}),
    );
    await userEvent.click(
      within(quantity).getByRole("button", { name: "Reject" }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: `Reject Variation ${QUANTITY_CHANGE.number}?`,
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText("Write why it is rejected."),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Not in the contract",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(
        posted(
          decide.holder.current,
          `${BOQ_API}/variations/${QUANTITY_CHANGE.id}/reject`,
        ),
      ).toEqual({ reason: "Not in the contract" }),
    );
    // The approved one has no decision buttons.
    const approved = list.getAllByRole("listitem")[2];
    if (approved == null) throw new Error("No approved Variation");
    await expect(
      within(approved).queryByRole("button", { name: "Approve" }),
    ).toBeNull();
  },
};

const raise = serveBoq({
  write: (call) =>
    call.path === `${BOQ_API}/variations`
      ? Response.json(QUANTITY_CHANGE, { status: 201 })
      : undefined,
});

/**
 * Deviations: items measured beyond the limit; "Raise variation" opens a
 * quantity change filled with what was measured. The limit can be changed.
 */
export const DeviationPanel: Story = {
  beforeEach: raise.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("tab", { name: "Deviations" }),
    );
    const list = within(
      await canvas.findByRole("list", { name: "Deviations" }),
    );
    await expect(list.getByText("33.33 % over")).toBeVisible();
    await expect(list.getByText("VAR/26-27/00002 pending")).toBeVisible();
    await expect(canvas.getByText("25 %")).toBeVisible();
    await userEvent.click(
      list.getByRole("button", { name: `Raise variation for ${PCC.itemNo}` }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Raise a Variation" }),
    );
    await expect(dialog.getByLabelText("New quantity")).toHaveValue("45");
    await expect(
      dialog.getByRole("combobox", { name: "BOQ item" }),
    ).toHaveValue(`${PCC.itemNo} · ${PCC.description}`);
    await userEvent.type(dialog.getByLabelText("Reason"), "Measured more");
    await userEvent.click(
      dialog.getByRole("button", { name: "Send for approval" }),
    );
    await waitFor(() =>
      expect(posted(raise.holder.current, `${BOQ_API}/variations`)).toEqual({
        projectId: PROJECT,
        kind: "quantity",
        reason: "Measured more",
        boqItemId: PCC.id,
        newQuantity: "45",
      }),
    );

    // The Company's limit.
    await userEvent.click(canvas.getByRole("button", { name: "Change" }));
    const limit = canvas.getByLabelText("Deviation limit");
    await userEvent.clear(limit);
    await userEvent.type(limit, "150");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("0 to 100, with at most two decimals."),
    ).toBeVisible();
    await expect(postCount(raise.holder.current)).toBe(1);
    await userEvent.clear(limit);
    await userEvent.type(limit, "10");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        posted(raise.holder.current, `${BOQ_API}/settings/update`),
      ).toEqual({
        deviationLimitPercent: "10",
      }),
    );
  },
};

const editItem = serveBoq();

/** A measured item opens with its quantity and rate read-only. */
export const EditMeasuredItem: Story = {
  beforeEach: editItem.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = (
      await canvas.findAllByRole("button", {
        name: `Actions for item ${FILLING.itemNo}`,
      })
    ).find((element) => element.checkVisibility());
    if (actions == null) throw new Error("No actions shown");
    await userEvent.click(actions);
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    const dialog = within(
      await body.findByRole("dialog", { name: `Edit item ${FILLING.itemNo}` }),
    );
    await expect(dialog.getByLabelText("Quantity")).toHaveAttribute("readonly");
    await expect(dialog.getByLabelText("Rate")).toHaveAttribute("readonly");
    await expect(
      dialog.getByText(/change its quantity or rate through a Variation/),
    ).toBeVisible();
  },
};

const inWorkOrder = serveBoq({
  write: (call) =>
    call.path === `${BOQ_API}/items/${PCC.id}/delete`
      ? Response.json(
          {
            code: "BOQ_ITEM_IN_WORK_ORDER",
            message:
              "Work Order WO/26-27/00003 names this item, so it cannot be deleted. Remove the line or cancel the Work Order first.",
            details: { workOrders: ["WO/26-27/00003"] },
          },
          { status: 409 },
        )
      : undefined,
});

/** An item a Work Order names (CM-1104): the delete says which Work Order holds it. */
export const DeleteItemInWorkOrder: Story = {
  beforeEach: inWorkOrder.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const actions = (
      await canvas.findAllByRole("button", {
        name: `Actions for item ${PCC.itemNo}`,
      })
    ).find((element) => element.checkVisibility());
    if (actions == null) throw new Error("No actions shown");
    await userEvent.click(actions);
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(
      await body.findByRole("alertdialog", {
        name: `Delete item ${PCC.itemNo}?`,
      }),
    );
    await expect(
      dialog.getByText(/or that a Work Order names, cannot be deleted/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(
      await dialog.findByText(/Work Order WO\/26-27\/00003 names this item/),
    ).toBeVisible();
  },
};
