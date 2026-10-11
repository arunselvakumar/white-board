import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  EQUIPMENT_API,
  mockEquipmentApi,
  rentedDetail,
  TOWER,
  VELAN,
  type EquipmentApiOptions,
} from "./equipment-fixtures";
import { EquipmentForm } from "./equipment-form";

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
  title: "Site Work/Equipment/Form",
  component: EquipmentForm,
  args: { onSaved: fn(), onCancel: fn() },
  beforeEach: equipmentApi(),
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <EquipmentForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

type Form = {
  getByRole: (role: "combobox", options: { name: string }) => HTMLElement;
};

async function choose(
  canvasElement: HTMLElement,
  userEvent: { click: (element: Element) => Promise<void> },
  form: Form,
  label: string,
  option: string,
) {
  await userEvent.click(form.getByRole("combobox", { name: label }));
  await userEvent.click(
    await body(canvasElement).findByRole("option", { name: option }),
  );
}

/** Company owned: identity, fuel, utilisation and target; the first place; Both only for Hourly. */
export const Owned: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Add Equipment" }),
    );
    await expect(
      form.getByRole("radio", { name: "Company owned" }),
    ).toBeChecked();
    await expect(form.queryByText("Hire details")).toBeNull();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Enter the equipment name."),
    ).toBeVisible();
    await expect(form.getByText("Enter the equipment number.")).toBeVisible();

    await userEvent.type(form.getByLabelText("Equipment Name"), "JCB 3DX");
    await userEvent.type(
      form.getByLabelText("Equipment Number"),
      "TN-09-AB-1234",
    );
    await userEvent.type(form.getByLabelText("Purchase Year"), "2019");
    await choose(canvasElement, userEvent, form, "Fuel Type", "Diesel");
    await choose(canvasElement, userEvent, form, "Fuel Unit", "Litre");
    await choose(canvasElement, userEvent, form, "Working Time Method", "Both");
    await userEvent.type(form.getByLabelText("Target"), "8");
    await choose(canvasElement, userEvent, form, "Target Unit", "hrs/day");
    await userEvent.type(form.getByLabelText("Min Utilisation (%)"), "60");
    await userEvent.type(
      form.getByLabelText("Expected Fuel Efficiency (per hour)"),
      "6.5",
    );
    // Km has no Both: the method falls back to Time Shifts.
    await choose(canvasElement, userEvent, form, "Utilisation Basis", "Km");
    await expect(
      form.getByRole("combobox", { name: "Working Time Method" }),
    ).toHaveTextContent("Time Shifts");
    await choose(canvasElement, userEvent, form, "Utilisation Basis", "Hourly");
    await choose(canvasElement, userEvent, form, "Target Unit", "hrs/day");
    await choose(
      canvasElement,
      userEvent,
      form,
      "Project or Warehouse",
      "Anugraha Towers",
    );
    await userEvent.type(form.getByLabelText("Location Name"), "Block C yard");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_API)[0]?.body).toMatchObject({
      ownership: "owned",
      name: "JCB 3DX",
      equipmentNumber: "TN-09-AB-1234",
      purchaseYear: 2019,
      fuelType: "diesel",
      fuelUnit: "litre",
      utilisationBasis: "hourly",
      workingTimeMethod: "time_shifts",
      targetValue: "8",
      targetUnit: "hours_per_day",
      minUtilisationPct: "60",
      expectedFuelEfficiency: "6.5",
      hirePartyId: null,
      hireRate: null,
      projectId: TOWER.id,
      locationName: "Block C yard",
    });
    await waitFor(async () => {
      await expect(args.onSaved).toHaveBeenCalled();
    });
  },
};

/** Rented: hire party, basis, rate in rupees (sent as paise) and Chargeable; no Purchase Year. */
export const Rented: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Add Equipment" }),
    );
    // A click anywhere on the card picks it, not only on the radio.
    await userEvent.click(
      await form.findByText("Hired from a Contractor at a rate."),
    );
    await expect(form.getByRole("radio", { name: "Rented" })).toBeChecked();
    await expect(
      form.getByRole("radio", { name: "Company owned" }),
    ).not.toBeChecked();
    await expect(
      form.getByRole("radio", { name: "Rented" }),
    ).toHaveAccessibleDescription("Hired from a Contractor at a rate.");
    await expect(form.queryByLabelText("Purchase Year")).toBeNull();
    await userEvent.type(form.getByLabelText("Equipment Name"), "Tipper 10 T");
    await userEvent.type(form.getByLabelText("Equipment Number"), "TN-10-X-9");
    await choose(canvasElement, userEvent, form, "Utilisation Basis", "Trip");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose the Contractor it is hired from."),
    ).toBeVisible();
    await choose(
      canvasElement,
      userEvent,
      form,
      "Hired from (Contractor)",
      VELAN.name,
    );
    await choose(canvasElement, userEvent, form, "Hire Basis", "Trip");
    await userEvent.type(form.getByLabelText("Rate"), "1500.50");
    await userEvent.click(form.getByRole("switch", { name: "Chargeable" }));
    await choose(
      canvasElement,
      userEvent,
      form,
      "Project or Warehouse",
      "Warehouse / off system",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_API)[0]?.body).toMatchObject({
        ownership: "rented",
        purchaseYear: null,
        utilisationBasis: "trip",
        hirePartyId: VELAN.id,
        hireBasis: "trip",
        hireRate: 150_050,
        idleChargeable: true,
        projectId: null,
      });
    });
  },
};

/** Without Financial a member cannot add rented equipment (it needs a rate). */
export const RentedNeedsFinancial: Story = {
  args: { fixedProjectId: TOWER.id },
  beforeEach: equipmentApi({
    flags: {
      "masters.equipments": [],
      "site_work.equipment_usage": ["read", "create"],
    },
  }),
  play: async ({ canvas }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Add Equipment" }),
    );
    await waitFor(async () => {
      await expect(form.getByRole("radio", { name: "Rented" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });
    await expect(form.getByText(/needs Financial on Equipments/)).toBeVisible();
    // Added from a Project, it starts there.
    await expect(await form.findByText(TOWER.name)).toBeVisible();
    await expect(
      form.queryByRole("combobox", { name: "Project or Warehouse" }),
    ).toBeNull();
  },
};

/** The server's refusal shows under its field. */
export const NumberTaken: Story = {
  beforeEach: equipmentApi({
    refuse: {
      code: "EQUIPMENT_NUMBER_TAKEN",
      message: "Equipment Number TN-09-AB-1234 is already in the register.",
      field: "equipmentNumber",
      status: 409,
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Add Equipment" }),
    );
    await userEvent.type(form.getByLabelText("Equipment Name"), "JCB 3DX");
    await userEvent.type(
      form.getByLabelText("Equipment Number"),
      "TN-09-AB-1234",
    );
    await choose(
      canvasElement,
      userEvent,
      form,
      "Project or Warehouse",
      "Anugraha Towers",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(
        "Equipment Number TN-09-AB-1234 is already in the register.",
      ),
    ).toBeVisible();
  },
};

/** Editing rented equipment without Financial keeps its rate: none is sent. */
export const EditWithoutRates: Story = {
  args: {
    equipment: rentedDetail({
      hireRate: null,
      actions: { ...rentedDetail().actions, seeRates: false },
    }),
  },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Edit Tipper 10 T" }),
    );
    await expect(form.getByRole("radio", { name: "Rented" })).toBeChecked();
    await expect(form.queryByLabelText("Rate")).toBeNull();
    await expect(form.queryByText("Where it is")).toBeNull();
    await userEvent.clear(form.getByLabelText("Equipment Name"));
    await userEvent.type(form.getByLabelText("Equipment Name"), "Tipper 12 T");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const path = `${EQUIPMENT_API}/${rentedDetail().id}/update`;
    await waitFor(async () => {
      await expect(posts(path)).toHaveLength(1);
    });
    const sent = posts(path)[0]?.body as Record<string, unknown>;
    await expect(sent).toMatchObject({
      name: "Tipper 12 T",
      hirePartyId: VELAN.id,
      expectedUpdatedAt: rentedDetail().updatedAt,
    });
    await expect("hireRate" in sent).toBe(false);
  },
};
