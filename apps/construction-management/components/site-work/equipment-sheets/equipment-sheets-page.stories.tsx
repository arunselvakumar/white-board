import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  EQUIPMENT_SHEET_SETTINGS_API,
  EQUIPMENT_SHEETS_API,
} from "@/src/queries/equipment-sheets";

import {
  equipmentSheet,
  mockEquipmentSheetApi,
  PROJECT_ID,
  rentedSheet,
  TODAY,
  type EquipmentSheetApiOptions,
} from "./equipment-sheet-fixtures";
import { EquipmentSheetsPage } from "./equipment-sheets-page";

let api: ReturnType<typeof mockEquipmentSheetApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function withApi(options: EquipmentSheetApiOptions = {}) {
  return () => {
    api = mockEquipmentSheetApi(options);
    return api.restore;
  };
}

const DECIDE = {
  edit: true,
  delete: true,
  approve: true,
  reject: true,
  duplicate: true,
};

const PENDING = [
  equipmentSheet({
    number: "EU/26-27/00011",
    approvalStatus: "pending",
    actions: DECIDE,
  }),
  rentedSheet({
    number: "EU/26-27/00012",
    approvalStatus: "pending",
    actions: DECIDE,
  }),
  equipmentSheet({
    number: "EU/26-27/00010",
    shift: "shift_2",
    approvalStatus: "approved",
    decidedAt: "2026-10-10T12:00:00.000Z",
    decidedBy: { userId: "user-arun", name: "Arun Selva Kumar" },
  }),
];

const meta = {
  title: "Site work/Equipment Usage/List",
  component: EquipmentSheetsPage,
  args: { projectId: PROJECT_ID, today: TODAY },
  beforeEach: withApi({
    items: [
      equipmentSheet({ number: "EU/26-27/00007", fuelOverrun: true }),
      rentedSheet({ number: "EU/26-27/00008" }),
    ],
  }),
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl p-6">
        <EquipmentSheetsPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentSheetsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

function first(elements: HTMLElement[]): HTMLElement {
  const element = elements[0];
  if (element == null) throw new Error("Not found");
  return element;
}

/** Owned and rented sheets, usage, hire with Financial, the totals; no approval. */
export const WithoutApproval: Story = {
  play: async ({ canvas }) => {
    await expect(
      (await canvas.findAllByText("EU/26-27/00007")).length,
    ).toBeGreaterThan(0);
    await expect(
      canvas.getByText(/2 usage sheets · 16 h worked · 1\.5 h idle/),
    ).toBeVisible();
    await expect(canvas.getAllByText("Rented").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("₹9,600.00").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("Fuel overrun").length).toBeGreaterThan(0);
    await expect(canvas.queryByText("Pending")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Bulk approval" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Add usage sheet" }),
    ).toBeVisible();
  },
};

/** Approval on: statuses, and bulk approve of the pending ones only. */
export const WithApproval: Story = {
  beforeEach: withApi({ settings: { approvalEnabled: true }, items: PENDING }),
  play: async ({ canvas, userEvent }) => {
    await expect(
      (await canvas.findAllByText("Approved")).length,
    ).toBeGreaterThan(0);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    await expect(
      first(canvas.getAllByRole("checkbox", { name: "Select EU/26-27/00010" })),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select EU/26-27/00011" })),
    );
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select EU/26-27/00012" })),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (2)" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 usage sheets approved.",
    );
    await expect(
      posts(`${EQUIPMENT_SHEETS_API}/bulk-approve`)[0]?.body,
    ).toEqual({
      projectId: PROJECT_ID,
      ids: [PENDING[0]?.id, PENDING[1]?.id],
    });
  },
};

/** Bulk reject asks for one reason for all. */
export const BulkReject: Story = {
  beforeEach: withApi({ settings: { approvalEnabled: true }, items: PENDING }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    await userEvent.click(
      first(
        await canvas.findAllByRole("checkbox", {
          name: "Select EU/26-27/00011",
        }),
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Reject (1)" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Log book missing");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_SHEETS_API}/bulk-reject`)[0]?.body,
      ).toEqual({
        projectId: PROJECT_ID,
        ids: [PENDING[0]?.id],
        reason: "Log book missing",
      });
    });
  },
};

/** No sheets yet: say what a usage sheet is and offer to add one. */
export const Empty: Story = {
  beforeEach: withApi({ items: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No usage sheets yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add usage sheet" }),
    ).toHaveLength(2);
  },
};

/** Read only: no add, gear or bulk approval; no hire without Financial. */
export const ReadOnly: Story = {
  beforeEach: withApi({
    flags: { "site_work.equipment_usage": ["read"] },
    items: [equipmentSheet()],
  }),
  play: async ({ canvas }) => {
    await canvas.findAllByText(/^EU\/26-27\//);
    await expect(
      canvas.queryByRole("link", { name: "Add usage sheet" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Equipment Usage settings" }),
    ).toBeNull();
    await expect(canvas.queryByText("Hire")).toBeNull();
  },
};

/** The gear: field toggles and approval. */
export const Settings: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Equipment Usage settings" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Equipment Usage settings",
      }),
    );
    await userEvent.click(
      await dialog.findByRole("switch", { name: "Meter readings" }),
    );
    await userEvent.click(
      dialog.getByRole("switch", { name: "Billable quantity (rented)" }),
    );
    await userEvent.click(
      dialog.getByRole("switch", { name: "Usage sheets need approval" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save settings" }),
    );
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEET_SETTINGS_API)[0]?.body).toEqual({
        projectId: PROJECT_ID,
        showOperator: true,
        showSupervisor: true,
        showLocation: true,
        showApproxWorkDone: true,
        showBillableQty: false,
        showFuel: true,
        showRemarks: true,
        showFiles: true,
        showMaterials: true,
        showMeterReadings: false,
        showBreakdownHours: true,
        approvalEnabled: true,
        expectedUpdatedAt: null,
      });
    });
  },
};
