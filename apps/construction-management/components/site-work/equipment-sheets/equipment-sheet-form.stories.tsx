import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { EQUIPMENT_SHEETS_API } from "@/src/queries/equipment-sheets";

import {
  DUMPER_ID,
  EXCAVATOR,
  EXCAVATOR_ID,
  mockEquipmentSheetApi,
  PROJECT_ID,
  rentedSheet,
  ROLLER_ID,
  sheetOptions,
  SUPERVISOR_ID,
  TIPPER_ID,
  TODAY,
  type EquipmentSheetApiOptions,
} from "./equipment-sheet-fixtures";
import { EquipmentSheetForm } from "./equipment-sheet-form";

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

const BASE = `/app/projects/${PROJECT_ID}/equipment/usage-sheets`;

const meta = {
  title: "Site work/Equipment Usage/Form",
  component: EquipmentSheetForm,
  args: {
    projectId: PROJECT_ID,
    today: TODAY,
    hrefFor: (id: string) => `${BASE}/${id}`,
  },
  beforeEach: withApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <EquipmentSheetForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentSheetForm>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = {
  findByRole: (
    role: "form",
    options: { name: string | RegExp },
  ) => Promise<HTMLElement>;
};

async function newForm(canvas: Canvas) {
  return within(
    await canvas.findByRole("form", { name: "New Equipment Usage sheet" }),
  );
}

type Form = Awaited<ReturnType<typeof newForm>>;
type User = {
  click: (element: Element) => Promise<void>;
  type: (element: Element, text: string) => Promise<void>;
  clear: (element: Element) => Promise<void>;
};

async function pick(form: Form, userEvent: User, name: RegExp) {
  await userEvent.click(await form.findByRole("radio", { name }));
}

async function shift(
  form: Form,
  userEvent: User,
  index: number,
  start: string,
  end: string,
) {
  const row = within(
    await form.findByRole("listitem", {
      name: `Time shift ${String(index + 1)}`,
    }),
  );
  await userEvent.clear(row.getByLabelText("Start"));
  await userEvent.type(row.getByLabelText("Start"), start);
  await userEvent.clear(row.getByLabelText("End"));
  await userEvent.type(row.getByLabelText("End"), end);
}

/**
 * The date comes first, then the equipment free that day in owned and
 * rented groups; a machine in maintenance is shown, not offered.
 */
export const PickEquipment: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await expect(form.getByRole("button", { name: "Next day" })).toBeDisabled();
    const owned = within(
      await form.findByRole("group", { name: "Company owned" }),
    );
    await expect(owned.getByRole("radio", { name: /^JCB 3DX/ })).toBeVisible();
    const rented = within(form.getByRole("group", { name: "Rented" }));
    await expect(
      rented.getByRole("radio", { name: /^Hired excavator/ }),
    ).toBeVisible();
    const blocked = within(form.getByRole("group", { name: "Not free" }));
    await expect(
      blocked.getByRole("radio", { name: /^Concrete mixer/ }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      blocked.getByText("In maintenance on that date"),
    ).toBeVisible();
    await expect(
      form.getByRole("link", { name: "Add equipment to this Project" }),
    ).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText("Choose the equipment.")).toBeVisible();
    await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(0);
  },
};

/** Time shifts: each row's hours, the total and the 24-hour cap, live. */
export const HourlyTimeShifts: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Road roller/);
    await shift(form, userEvent, 0, "08:00", "12:00");
    await expect(
      await form.findByText("Shift hours:", { exact: false }),
    ).toHaveTextContent("4 h");
    await userEvent.click(form.getByRole("button", { name: "Add time shift" }));
    await shift(form, userEvent, 1, "22:00", "02:30");
    await expect(
      form.getByText("Shift hours:", { exact: false }),
    ).toHaveTextContent("8.5 h");
    await userEvent.type(form.getByLabelText("Idle hours"), "1");
    await expect(
      form.getByText(/Usage 8\.5 h \+ idle \+ breakdown = 9\.5 of 24 h/),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Operator"), "Ramesh K");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(form.getByRole("combobox", { name: "Supervisor" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Senthil Kumar" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_SHEETS_API)[0]?.body).toMatchObject({
      projectId: PROJECT_ID,
      equipmentId: ROLLER_ID,
      sheetDate: TODAY,
      shift: "shift_1",
      timeShifts: [
        { startTime: "08:00", endTime: "12:00" },
        { startTime: "22:00", endTime: "02:30" },
      ],
      openingReading: null,
      idleHours: "1",
      operatorName: "Ramesh K",
      supervisorUserId: SUPERVISOR_ID,
      approve: false,
    });
  },
};

/** Overlapping shifts and more than 24 hours are caught before saving. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Road roller/);
    await shift(form, userEvent, 0, "06:00", "10:00");
    await userEvent.click(form.getByRole("button", { name: "Add time shift" }));
    await shift(form, userEvent, 1, "09:00", "11:00");
    await expect(
      await form.findByText("This shift overlaps another."),
    ).toBeVisible();
    await shift(form, userEvent, 1, "10:00", "23:00");
    await userEvent.type(form.getByLabelText("Idle hours"), "8");
    await expect(
      await form.findByText(/= 25 of 24 h — more than a day/),
    ).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText(/A day has 24\./)).toBeVisible();
    await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(0);
  },
};

/**
 * Meter readings: the opening starts from the last closing; a rented
 * machine shows the hire preview (Financial): ₹1,200 × (7.5 h + 0.5 h
 * chargeable idle).
 */
export const RentedMeterWithHire: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Hired excavator/);
    await expect(await form.findByLabelText("Opening reading")).toHaveValue(
      "4210.5",
    );
    await expect(
      form.getByText(/Last closing 4210\.5 on 9 Oct 2026/),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Closing reading"), "4218");
    await userEvent.type(form.getByLabelText("Idle hours"), "0.5");
    await expect(form.getByLabelText("Hire Cost")).toHaveTextContent(
      "₹9,600.00",
    );
    await expect(form.getByLabelText("Billable hours")).toHaveAttribute(
      "placeholder",
      "8",
    );
    await userEvent.type(form.getByLabelText("Fuel consumed (Litre)"), "40");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(form.getByRole("combobox", { name: "Borne by" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Hire party" }),
    );
    // An override of the billable quantity.
    await userEvent.type(form.getByLabelText("Billable hours"), "10");
    await expect(form.getByLabelText("Hire Cost")).toHaveTextContent(
      "₹12,000.00",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_SHEETS_API)[0]?.body).toMatchObject({
      equipmentId: EXCAVATOR_ID,
      timeShifts: [],
      openingReading: "4210.5",
      closingReading: "4218",
      idleHours: "0.5",
      fuelQty: "40",
      fuelBorneBy: "hire_party",
      unitRate: null,
      billableQty: "10",
    });
  },
};

/** Without Financial the hire section is not shown and no rate is sent. */
export const RentedWithoutFinancial: Story = {
  beforeEach: withApi({
    flags: {
      "site_work.equipment_usage": ["create", "read", "update"],
    },
    options: sheetOptions({
      items: [{ ...EXCAVATOR, hireRate: null }],
      blocked: [],
    }),
  }),
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Hired excavator/);
    await userEvent.type(await form.findByLabelText("Closing reading"), "4218");
    await expect(form.queryByRole("heading", { name: "Hire" })).toBeNull();
    await expect(form.queryByLabelText("Unit Rate")).toBeNull();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_SHEETS_API)[0]?.body).toMatchObject({
      unitRate: null,
      billableQty: null,
    });
  },
};

/** Both: usage comes from the shifts, and a mismatch with the meter is shown. */
export const BothWithMismatch: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^JCB 3DX/);
    await shift(form, userEvent, 0, "08:00", "12:00");
    await userEvent.click(form.getByRole("button", { name: "Add time shift" }));
    await shift(form, userEvent, 1, "13:00", "17:30");
    await expect(form.getByLabelText("Opening reading")).toHaveValue("1250");
    await userEvent.type(form.getByLabelText("Closing reading"), "1258");
    await expect(
      await form.findByText(
        /The shifts give 8\.5 h but the meter 8 h\. Usage is taken from the shifts\./,
      ),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Fuel consumed (Litre)"), "60");
    await expect(
      await form.findByText(/fuel overrun: above the expected 6\.5/),
    ).toBeVisible();
  },
};

/** Km: the odometer gives the distance; fuel per km is checked. */
export const KmByMeter: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Tipper 10 T/);
    await expect(await form.findByLabelText("Opening reading")).toHaveValue(
      "45210",
    );
    await userEvent.type(form.getByLabelText("Closing reading"), "45296.4");
    await expect(form.getByText("86.4 km")).toBeVisible();
    await expect(form.queryByLabelText("Distance (km)")).toBeNull();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_SHEETS_API)[0]?.body).toMatchObject({
      equipmentId: TIPPER_ID,
      closingReading: "45296.4",
      distanceKm: null,
    });
  },
};

/** Trip: the number of trips, with the shifts it worked. */
export const Trips: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Site dumper/);
    await shift(form, userEvent, 0, "07:00", "15:00");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Enter the number of trips."),
    ).toBeVisible();
    await userEvent.type(form.getByLabelText("Trips"), "14");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_SHEETS_API)[0]?.body).toMatchObject({
      equipmentId: DUMPER_ID,
      trips: 14,
    });
  },
};

/** A server refusal lands under its field (here the shift taken). */
export const ShiftTaken: Story = {
  beforeEach: withApi({
    post: (call) =>
      call.path === EQUIPMENT_SHEETS_API
        ? Response.json(
            {
              code: "EQUIPMENT_SHEET_EXISTS",
              message:
                "This equipment already has a usage sheet for that date and shift.",
              details: { field: "shift" },
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Road roller/);
    await shift(form, userEvent, 0, "08:00", "12:00");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(
        "This equipment already has a usage sheet for that date and shift.",
      ),
    ).toBeVisible();
  },
};

/** Edit: the machine is fixed; Save & Approve shows with approval on. */
export const EditRented: Story = {
  beforeEach: withApi({ settings: { approvalEnabled: true } }),
  args: { sheet: rentedSheet() },
  play: async ({ canvas, userEvent }) => {
    const form = within(await canvas.findByRole("form", { name: /^Edit / }));
    await expect(form.queryByRole("radio")).toBeNull();
    await expect(
      form.getByText(/Hired excavator · TN-22-EX-0420/),
    ).toBeVisible();
    await expect(form.getByLabelText("Closing reading")).toHaveValue("4218");
    await expect(form.getByLabelText("Hire Cost")).toHaveTextContent(
      "₹9,600.00",
    );
    const saveAndApprove = await form.findByRole("button", {
      name: "Save & Approve",
    });
    await expect(
      form.queryByRole("button", { name: "Save & Add New" }),
    ).toBeNull();
    await userEvent.click(saveAndApprove);
    await waitFor(async () => {
      await expect(
        api.calls.mock.calls.find(
          ([call]) => call.method === "POST" && call.path.endsWith("/update"),
        )?.[0].body,
      ).toMatchObject({ approve: true, closingReading: "4218" });
    });
  },
};

/** Hidden fields are not shown; with the meter hidden the hours are typed. */
export const ConfiguredFields: Story = {
  beforeEach: withApi({
    settings: {
      showOperator: false,
      showFuel: false,
      showMeterReadings: false,
      showBreakdownHours: false,
      showMaterials: false,
    },
  }),
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Hired excavator/);
    await expect(await form.findByLabelText("Usage hours")).toBeVisible();
    await expect(form.queryByLabelText("Opening reading")).toBeNull();
    await expect(form.queryByLabelText("Operator")).toBeNull();
    await expect(form.queryByLabelText("Breakdown hours")).toBeNull();
    await expect(form.queryByRole("heading", { name: "Fuel" })).toBeNull();
    await userEvent.type(form.getByLabelText("Usage hours"), "6.5");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(EQUIPMENT_SHEETS_API)).toHaveLength(1);
    });
    await expect(posts(EQUIPMENT_SHEETS_API)[0]?.body).toMatchObject({
      usageHours: "6.5",
      openingReading: null,
      operatorName: null,
      fuelQty: null,
    });
  },
};

/** Save & Add New keeps the date, shift and supervisor. */
export const SaveAndAddNew: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = await newForm(canvas);
    await pick(form, userEvent, /^Road roller/);
    await shift(form, userEvent, 0, "08:00", "12:00");
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(form.getByRole("combobox", { name: "Work Shift" }));
    await userEvent.click(await body.findByRole("option", { name: "Shift 2" }));
    await userEvent.click(form.getByRole("combobox", { name: "Supervisor" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Senthil Kumar" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save & Add New" }));
    await expect(await form.findByRole("status")).toHaveTextContent(
      /saved\. Fill in the next usage sheet/,
    );
    await expect(
      form.getByRole("combobox", { name: "Work Shift" }),
    ).toHaveTextContent("Shift 2");
    // The machine is chosen again; the supervisor stayed.
    await expect(
      form.getByRole("radio", { name: /^Road roller/ }),
    ).not.toBeChecked();
    await pick(form, userEvent, /^JCB 3DX/);
    await expect(
      await form.findByRole("combobox", { name: "Supervisor" }),
    ).toHaveTextContent("Senthil Kumar");
  },
};
