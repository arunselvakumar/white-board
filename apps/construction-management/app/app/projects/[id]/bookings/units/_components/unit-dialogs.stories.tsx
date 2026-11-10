import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import { UnitDetailsDialog, UnitUnavailableDialog } from "./unit-dialogs";
import {
  mockUnitsApi,
  salesUnit,
  SALES_PROJECT_ID,
  towerAFloors,
  UNITS_API,
  type UnitsApiOptions,
} from "./units-fixtures";

let api: ReturnType<typeof mockUnitsApi>;
function unitsApi(options: UnitsApiOptions = {}) {
  return () => {
    api = mockUnitsApi(options);
    return api.restore;
  };
}

const cell = towerAFloors()[2]?.units[0];
if (cell == null) throw new Error("fixture unit");
const unit = salesUnit(cell);

const meta = {
  title: "Sales/Units/Unit dialogs",
  component: UnitDetailsDialog,
  args: {
    projectId: SALES_PROJECT_ID,
    unit,
    open: true,
    onOpenChange: fn(),
  },
  beforeEach: unitsApi(),
  render: (args) => (
    <StoryQueries>
      <UnitDetailsDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof UnitDetailsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function posts(action: string) {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "POST" &&
        call.path === `${UNITS_API}/${unit.id}/${action}`,
    );
}

/** Unit type and areas, saved with the profile's `updatedAt`. */
export const Details: Story = {
  play: async ({ canvasElement, args, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    const type = dialog.getByLabelText("Unit type");
    await userEvent.clear(type);
    await userEvent.type(type, "3BHK");
    const carpet = dialog.getByLabelText("Carpet area");
    await userEvent.clear(carpet);
    await userEvent.type(carpet, "1,050.50");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts("details")).toHaveLength(1);
    });
    await expect(posts("details")[0]?.body).toMatchObject({
      projectId: SALES_PROJECT_ID,
      expectedUpdatedAt: unit.profile.updatedAt,
      unitType: "3BHK",
      carpetArea: "1,050.50",
      areaUnit: "sq_ft",
    });
    await waitFor(async () => {
      await expect(args.onOpenChange).toHaveBeenCalledWith(false);
    });
  },
};

/** An area that is not a number is refused before saving. */
export const BadArea: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    const carpet = dialog.getByLabelText("Carpet area");
    await userEvent.clear(carpet);
    await userEvent.type(carpet, "12.345");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(
        "Enter an area more than 0, with at most two decimals.",
      ),
    ).toBeVisible();
    await expect(posts("details")).toHaveLength(0);
  },
};

/** Unavailable needs a reason; a booked unit is refused with the server's words. */
export const Unavailable: Story = {
  beforeEach: unitsApi({
    refuse: {
      status: 409,
      code: "UNIT_HAS_BOOKING",
      message:
        "This unit is on hold or booked. Cancel the booking before marking it unavailable.",
    },
  }),
  render: (args) => (
    <StoryQueries>
      <UnitUnavailableDialog {...args} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark unavailable" }),
    );
    await expect(
      await dialog.findByText("Choose why the unit is not for sale."),
    ).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Reason"));
    await userEvent.click(
      await body.findByRole("option", { name: "Landowner share" }),
    );
    await userEvent.type(dialog.getByLabelText("Note"), "Kept for the family");
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark unavailable" }),
    );
    await expect(
      await dialog.findByText(
        /Cancel the booking before marking it unavailable/,
      ),
    ).toBeVisible();
    await expect(posts("unavailable")[0]?.body).toMatchObject({
      reason: "landowner_share",
      note: "Kept for the family",
    });
  },
};
