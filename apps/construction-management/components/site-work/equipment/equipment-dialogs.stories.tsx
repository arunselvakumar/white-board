import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { localToday } from "@/components/procurement/inventory/inventory-format";

import {
  MaintenanceDialog,
  ReturnToServiceDialog,
  TransferDialog,
} from "./equipment-dialogs";
import {
  brokenDetail,
  EQUIPMENT_API,
  equipmentDetail,
  JCB_ID,
  mockEquipmentApi,
  VILLA,
  type EquipmentApiOptions,
} from "./equipment-fixtures";

let api: ReturnType<typeof mockEquipmentApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function equipmentApi(options: EquipmentApiOptions = {}) {
  return () => {
    api = mockEquipmentApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Site Work/Equipment/Dialogs",
  component: TransferDialog,
  args: { equipment: equipmentDetail(), open: true, onClose: fn() },
  beforeEach: equipmentApi(),
  render: (args) => (
    <StoryQueries>
      <TransferDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TransferDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function page(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Transfer to Project: destination (not the current one), date, location name, remark. */
export const Transfer: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = page(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Transfer equipment" }),
    );
    await expect(
      body.getByText(/Effect on tracking: from the transfer date it leaves/),
    ).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Transfer" }));
    await expect(
      await form.findByText("Choose the Project it goes to."),
    ).toBeVisible();
    await expect(form.getByText("Enter where it is kept.")).toBeVisible();
    await userEvent.click(
      form.getByRole("combobox", { name: "Destination Project" }),
    );
    await expect(
      body.queryByRole("option", { name: "Anugraha Towers" }),
    ).toBeNull();
    await userEvent.click(
      await body.findByRole("option", { name: VILLA.name }),
    );
    await userEvent.type(form.getByLabelText("Location Name"), "Plot 4 yard");
    await userEvent.type(form.getByLabelText("Remark"), "Villa foundations");
    await userEvent.click(form.getByRole("button", { name: "Transfer" }));
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_API}/${JCB_ID}/transfer`)[0]?.body,
      ).toEqual({
        expectedUpdatedAt: equipmentDetail().updatedAt,
        kind: "to_project",
        toProjectId: VILLA.id,
        movementDate: localToday(),
        locationName: "Plot 4 yard",
        remark: "Villa foundations",
      });
    });
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
  },
};

/** Transfer to Warehouse; the server's date refusal shows under the date. */
export const TransferRefused: Story = {
  beforeEach: equipmentApi({
    refuse: {
      code: "TRANSFER_BEFORE_LAST_SHEET",
      message:
        "It has a usage sheet at this Project on 2026-10-10. Choose a later date.",
      field: "movementDate",
    },
  }),
  play: async ({ canvasElement, userEvent }) => {
    const body = page(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Transfer equipment" }),
    );
    await userEvent.click(
      form.getByRole("radio", { name: "Transfer to Warehouse" }),
    );
    await expect(
      form.getByRole("radio", { name: "Transfer to Warehouse" }),
    ).toBeChecked();
    await expect(
      form.queryByRole("combobox", { name: "Destination Project" }),
    ).toBeNull();
    await userEvent.type(
      form.getByLabelText("Location Name"),
      "Ambattur godown",
    );
    await userEvent.click(form.getByRole("button", { name: "Transfer" }));
    await expect(
      await form.findByText(/It has a usage sheet at this Project/),
    ).toBeVisible();
    await expect(
      posts(`${EQUIPMENT_API}/${JCB_ID}/transfer`)[0]?.body,
    ).toMatchObject({ kind: "to_warehouse", toProjectId: null });
  },
};

/** Log Maintenance: kind, start date, workshop, cost (Financial) and description. */
export const LogMaintenance: Story = {
  render: (args) => (
    <StoryQueries>
      <MaintenanceDialog {...args} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = page(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Log Maintenance" }),
    );
    await userEvent.click(form.getByRole("combobox", { name: "Kind" }));
    await userEvent.click(await body.findByRole("option", { name: "Repair" }));
    await userEvent.type(form.getByLabelText("Workshop"), "Sri Balaji Motors");
    await userEvent.type(form.getByLabelText("Cost"), "4500");
    await userEvent.type(
      form.getByLabelText("Description"),
      "Hydraulic hose burst",
    );
    await userEvent.click(
      form.getByRole("button", { name: "Log Maintenance" }),
    );
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_API}/${JCB_ID}/maintenance`)[0]?.body,
      ).toEqual({
        expectedUpdatedAt: equipmentDetail().updatedAt,
        kind: "repair",
        startDate: localToday(),
        workshop: "Sri Balaji Motors",
        description: "Hydraulic hose burst",
        cost: 450_000,
      });
    });
  },
};

/** Without Financial there is no cost field, and none is sent. */
export const LogMaintenanceWithoutCost: Story = {
  args: {
    equipment: equipmentDetail({
      actions: { ...equipmentDetail().actions, seeCosts: false },
    }),
  },
  render: (args) => (
    <StoryQueries>
      <MaintenanceDialog {...args} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = page(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Log Maintenance" }),
    );
    await expect(form.queryByLabelText("Cost")).toBeNull();
    await userEvent.click(
      form.getByRole("button", { name: "Log Maintenance" }),
    );
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_API}/${JCB_ID}/maintenance`)[0]?.body,
      ).not.toHaveProperty("cost");
    });
  },
};

/** Return to Service closes the open entry with the date, final cost and a remark. */
export const ReturnToService: Story = {
  args: { equipment: brokenDetail() },
  render: (args) => (
    <StoryQueries>
      <ReturnToServiceDialog {...args} />
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const body = page(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Return to Service" }),
    );
    await expect(form.getByLabelText("Final Cost")).toHaveValue("4500");
    await userEvent.clear(form.getByLabelText("Final Cost"));
    await userEvent.type(form.getByLabelText("Final Cost"), "5200");
    await userEvent.type(form.getByLabelText("Remark"), "New hose fitted");
    await userEvent.click(
      form.getByRole("button", { name: "Return to Service" }),
    );
    const entryId = brokenDetail().openMaintenance?.id ?? "";
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_API}/${JCB_ID}/maintenance/${entryId}/close`)[0]
          ?.body,
      ).toEqual({
        expectedUpdatedAt: brokenDetail().updatedAt,
        endDate: localToday(),
        remark: "New hose fitted",
        cost: 520_000,
      });
    });
  },
};
