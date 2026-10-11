import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import { EquipmentSheetDetailPage } from "./equipment-sheet-detail";
import {
  equipmentSheet,
  mockEquipmentSheetApi,
  PROJECT_ID,
  rentedSheet,
  type EquipmentSheetApiOptions,
} from "./equipment-sheet-fixtures";

let api: ReturnType<typeof mockEquipmentSheetApi>;

function posts(suffix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path.endsWith(suffix));
}

function withApi(options: EquipmentSheetApiOptions = {}) {
  return () => {
    api = mockEquipmentSheetApi(options);
    return api.restore;
  };
}

const BROKEN = equipmentSheet({
  number: "EU/26-27/00031",
  breakdownHours: "3.00",
  idleHours: "0.00",
  workItem: "Basement excavation, Block C",
  fuelOverrun: true,
  fuelQty: "70.000",
  openingReading: "1252.00",
  closingReading: "1258.00",
  meterDelta: "6.00",
  meterGap: "2.00",
  approvalStatus: "pending",
  actions: {
    edit: true,
    delete: true,
    approve: true,
    reject: true,
    duplicate: true,
  },
});

const RENTED = rentedSheet({ number: "EU/26-27/00032" });

const meta = {
  title: "Site work/Equipment Usage/Detail",
  component: EquipmentSheetDetailPage,
  args: { projectId: PROJECT_ID, id: BROKEN.id },
  beforeEach: withApi({ items: [BROKEN, RENTED] }),
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl p-6">
        <EquipmentSheetDetailPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentSheetDetailPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A breakdown: Record hindrance links to a hindrance prefilled from the
 * sheet; the meter gap, the shift / meter mismatch and the fuel overrun
 * are shown.
 */
export const BreakdownWithRecordHindrance: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "EU/26-27/00031" }),
    ).toBeVisible();
    const link = await canvas.findByRole("link", { name: "Record hindrance" });
    await expect(link.getAttribute("href")).toContain(
      `cause=equipment_breakdown`,
    );
    await expect(link.getAttribute("href")).toContain(
      `equipmentUsageSheetId=${BROKEN.id}`,
    );
    await expect(canvas.getByText(/a gap of 2\./)).toBeVisible();
    await expect(
      canvas.getByText(/The shifts give 8\.5 h but the meter 6 h/),
    ).toBeVisible();
    await expect(
      canvas.getByText(/Fuel overrun: above the expected 6\.5/),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Duplicate" }),
    ).toBeVisible();
  },
};

/** No Hindrance create right: no Record hindrance. */
export const WithoutHindranceRights: Story = {
  beforeEach: withApi({
    items: [BROKEN],
    flags: { "site_work.hindrances": ["read"] },
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { name: "EU/26-27/00031" });
    await canvas.findByRole("button", { name: "Edit" });
    await expect(
      canvas.queryByRole("link", { name: "Record hindrance" }),
    ).toBeNull();
  },
};

/** A rented sheet with Financial: the hire party, rate, quantity and cost. */
export const RentedWithHire: Story = {
  args: { id: RENTED.id },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Velan Earth Movers")).toBeVisible();
    await expect(canvas.getByText("₹9,600.00")).toBeVisible();
    await expect(canvas.getByText("8 hours")).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Record hindrance" }),
    ).toBeNull();
  },
};

/** Approve sends the sheet's `updatedAt`. */
export const Approve: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve" }),
    );
    await waitFor(async () => {
      await expect(posts("/approve")[0]?.body).toEqual({
        expectedUpdatedAt: BROKEN.updatedAt,
      });
    });
  },
};

/** Reject asks for a reason. */
export const Reject: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reject" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Hours too high");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(posts("/reject")[0]?.body).toMatchObject({
        reason: "Hours too high",
      });
    });
  },
};
