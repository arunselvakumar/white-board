import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  CONCRETE,
  EARTHWORK,
  LIBRARY_PCC,
  PCC,
  PROJECT,
  UOM_CUM,
  UOM_SQM,
  WING_A,
} from "./boq-fixtures";
import { BoqItemDialog } from "./boq-item-dialog";
import { BOQ_API, postCount, posted, serveBoq } from "./boq-stories-api";

const meta = {
  title: "Contracts/BOQ/Item dialog",
  component: BoqItemDialog,
  args: {
    projectId: PROJECT,
    financial: true,
    item: null,
    sectionId: EARTHWORK,
    onClose: fn(),
  },
  render: (args) => (
    <StoryQueries>
      <BoqItemDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BoqItemDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

const typed = serveBoq({
  write: (call) =>
    call.path === `${BOQ_API}/items`
      ? Response.json(PCC, { status: 201 })
      : undefined,
});

/** A typed item: the fields are checked, then sent with its section and Wing. */
export const Typed: Story = {
  beforeEach: typed.beforeEach,
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add BOQ item" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add item" }));
    await expect(
      await dialog.findByText("Enter the item number"),
    ).toBeVisible();
    await expect(dialog.getByText("Enter the description")).toBeVisible();
    await expect(dialog.getByText("Pick the UoM")).toBeVisible();
    await expect(
      dialog.getByText("More than 0, with at most four decimals"),
    ).toBeVisible();
    await expect(
      dialog.getByText("Enter the rate in rupees, like 6123.45"),
    ).toBeVisible();
    await expect(postCount(typed.holder.current)).toBe(0);

    await userEvent.type(dialog.getByLabelText("Item no"), "1.3");
    await userEvent.type(
      dialog.getByLabelText("Description"),
      "Anti-termite treatment",
    );
    await userEvent.click(dialog.getByLabelText("UoM"));
    await userEvent.click(await body.findByRole("option", { name: "sqm" }));
    await userEvent.click(dialog.getByLabelText("Wing"));
    await userEvent.click(
      await body.findByRole("option", { name: "A Wing · Phase 1" }),
    );
    await userEvent.type(dialog.getByLabelText("Quantity"), "1250.5");
    await userEvent.type(dialog.getByLabelText("Rate"), "42.75");
    await userEvent.click(dialog.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted(typed.holder.current, `${BOQ_API}/items`)).toEqual({
      projectId: PROJECT,
      libraryItemId: null,
      sectionId: EARTHWORK,
      itemNo: "1.3",
      description: "Anti-termite treatment",
      uomId: UOM_SQM,
      sacHsn: null,
      quantity: "1250.5",
      rate: 42_75,
      wingId: WING_A,
      locationId: null,
    });
  },
};

const taken = serveBoq({
  write: () =>
    Response.json(
      {
        code: "BOQ_ITEM_NO_TAKEN",
        message: "The BOQ already has an item numbered “1.1”.",
      },
      { status: 409 },
    ),
});

/** A number the BOQ already has shows under Item no. */
export const NumberTaken: Story = {
  beforeEach: taken.beforeEach,
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add BOQ item" }),
    );
    await userEvent.type(dialog.getByLabelText("Item no"), "1.1");
    await userEvent.type(dialog.getByLabelText("Description"), "Again");
    await userEvent.click(dialog.getByLabelText("UoM"));
    await userEvent.click(await body.findByRole("option", { name: "cum" }));
    await userEvent.type(dialog.getByLabelText("Quantity"), "1");
    await userEvent.type(dialog.getByLabelText("Rate"), "1");
    await userEvent.click(dialog.getByRole("button", { name: "Add item" }));
    await expect(
      await dialog.findByText("The BOQ already has an item numbered “1.1”."),
    ).toBeVisible();
  },
};

const library = serveBoq({
  write: (call) =>
    call.path === `${BOQ_API}/items`
      ? Response.json(PCC, { status: 201 })
      : undefined,
});

/**
 * From the Item Library: the pick fills the number, description, UoM,
 * SAC/HSN and adopted rate, and the link goes with the item.
 */
export const FromLibrary: Story = {
  args: { sectionId: CONCRETE },
  beforeEach: library.beforeEach,
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add BOQ item" }),
    );
    const picker = dialog.getByRole("combobox", { name: "Item Library" });
    await userEvent.type(picker, "pcc");
    const list = within(await body.findByRole("listbox", { name: "Items" }));
    await userEvent.click(
      await list.findByRole("option", { name: /^5\.1\.1 · PCC 1:4:8/ }),
    );
    await expect(dialog.getByLabelText("Item no")).toHaveValue("5.1.1");
    await expect(dialog.getByLabelText("Description")).toHaveValue(
      "PCC 1:4:8 in foundations, excluding shuttering.",
    );
    await expect(dialog.getByLabelText("UoM")).toHaveTextContent("cum");
    await expect(dialog.getByLabelText("SAC/HSN")).toHaveValue("995411");
    await expect(dialog.getByLabelText("Rate")).toHaveValue("6123.45");
    await expect(dialog.getByLabelText("Section")).toHaveTextContent(
      "Concrete work",
    );
    await userEvent.type(dialog.getByLabelText("Quantity"), "32.5");
    await userEvent.click(dialog.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted(library.holder.current, `${BOQ_API}/items`)).toEqual({
      projectId: PROJECT,
      libraryItemId: LIBRARY_PCC,
      sectionId: CONCRETE,
      itemNo: "5.1.1",
      description: "PCC 1:4:8 in foundations, excluding shuttering.",
      uomId: UOM_CUM,
      sacHsn: "995411",
      quantity: "32.5",
      rate: 6_123_45,
      wingId: null,
      locationId: null,
    });
  },
};

const quantities = serveBoq();

/** Without Financial there is no rate to type. */
export const WithoutFinancial: Story = {
  args: { financial: false },
  beforeEach: quantities.beforeEach,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add BOQ item" }),
    );
    await expect(dialog.getByLabelText("Quantity")).toBeVisible();
    await expect(dialog.queryByLabelText("Rate")).toBeNull();
  },
};
