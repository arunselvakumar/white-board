import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { pickMaterial } from "@/components/procurement/material-options-fixtures";
import { WORKSHEETS_API } from "@/src/queries/worksheets";

import {
  BRICKWORK_ID,
  CEMENT,
  CONTRACTOR_ID,
  LOCATION_ID,
  MASONRY_ID,
  mockWorksheetApi,
  NO_PLACES,
  PROJECT_ID,
  SAND,
  SQM_ID,
  stockRefusal,
  TODAY,
  worksheet,
  type WorksheetApiOptions,
} from "./worksheet-fixtures";
import { WorksheetForm } from "./worksheet-form";

let api: ReturnType<typeof mockWorksheetApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function withApi(options: WorksheetApiOptions = {}) {
  return () => {
    api = mockWorksheetApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${PROJECT_ID}/worksheets`;

const meta = {
  title: "Site work/Daily Worksheet/Form",
  component: WorksheetForm,
  args: {
    projectId: PROJECT_ID,
    today: TODAY,
    hrefFor: (id: string) => `${BASE}/${id}`,
  },
  beforeEach: withApi({ stock: { [CEMENT.id]: "30.000" } }),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <WorksheetForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof WorksheetForm>;

export default meta;
type Story = StoryObj<typeof meta>;

type Scope = {
  getByRole: (
    role: "combobox",
    options: { name: string | RegExp },
  ) => HTMLElement;
};
type Canvas = {
  findByRole: (
    role: "form",
    options: { name: string | RegExp },
  ) => Promise<HTMLElement>;
};
type User = { click: (element: Element) => Promise<void> };

async function choose(
  form: Scope,
  canvasElement: HTMLElement,
  userEvent: User,
  label: string,
  option: string,
) {
  await userEvent.click(form.getByRole("combobox", { name: label }));
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole("option", {
      name: option,
    }),
  );
}

async function newForm(canvas: Canvas) {
  return within(
    await canvas.findByRole("form", { name: "New Daily Worksheet" }),
  );
}

/** Contractor, Department, Work Shift, location and a headcount are needed. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = await newForm(canvas);
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText("Choose the Contractor.")).toBeVisible();
    await expect(form.getByText("Choose the Department.")).toBeVisible();
    await expect(form.getByText("Choose the Work Shift.")).toBeVisible();
    await expect(
      form.getByText("Choose where the work was done."),
    ).toBeVisible();
    await expect(
      form.getByText("Enter the skilled or unskilled headcount."),
    ).toBeVisible();
    // A quantity of work done needs its unit.
    await userEvent.type(form.getByLabelText("Approx Work Done"), "12");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose the unit of the work done."),
    ).toBeVisible();
    // No future dates: the stepper stops at today.
    await expect(form.getByRole("button", { name: "Next day" })).toBeDisabled();
    await expect(posts(WORKSHEETS_API)).toHaveLength(0);
  },
};

/**
 * Contractor → Department → Work Type cascade, the attendance panel's
 * **Use remaining**, Bulk Select (the Work Type's materials first) with
 * the stock on the date, then Save.
 */
export const PrefillAndSave: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = await newForm(canvas);
    const body = within(canvasElement.ownerDocument.body);
    await choose(form, canvasElement, userEvent, "Location", "Pump house");
    await choose(
      form,
      canvasElement,
      userEvent,
      "Contractor",
      "Velan Constructions",
    );
    // Only the Contractor's Departments are offered.
    await userEvent.click(form.getByRole("combobox", { name: "Department" }));
    await expect(body.queryByRole("option", { name: "Centering" })).toBeNull();
    await userEvent.click(
      await body.findByRole("option", { name: "Masonry & Plaster" }),
    );
    await choose(form, canvasElement, userEvent, "Work Type", "Brickwork");
    await choose(form, canvasElement, userEvent, "Work Shift", "Shift 2");

    const panel = within(
      await form.findByRole("region", { name: "Attendance on 10 Oct 2026" }),
    );
    await expect(
      panel.getByRole("row", { name: "Remaining 8 12" }),
    ).toBeVisible();
    await userEvent.click(panel.getByRole("button", { name: "Use remaining" }));
    await expect(form.getByLabelText("Skilled Labours")).toHaveValue("8");
    await expect(form.getByLabelText("Unskilled Labours")).toHaveValue("12");

    await userEvent.type(form.getByLabelText("Approx Work Done"), "42.5");
    await choose(form, canvasElement, userEvent, "Unit", "sqm");

    // Bulk Select: Brickwork's M Sand first, then the rest.
    await userEvent.click(form.getByRole("button", { name: "Bulk Select" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Bulk Select Materials" }),
    );
    const assigned = within(
      await dialog.findByRole("region", { name: "Assigned to Brickwork" }),
    );
    await userEvent.click(
      await assigned.findByRole("checkbox", { name: /^M Sand/ }),
    );
    const others = within(
      dialog.getByRole("region", { name: "Other materials" }),
    );
    await userEvent.click(
      await others.findByRole("checkbox", { name: /^Cement OPC 53/ }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Add 2 materials" }),
    );
    await expect(
      form.getByRole("listitem", { name: "Material 2" }),
    ).toBeVisible();
    await expect(await form.findByText("Available: 30 Bag")).toBeVisible();
    const cementQty = form.getByLabelText("Used Qty (Bag)");
    await userEvent.type(cementQty, "40");
    await expect(
      await form.findByText(/more than the stock on this date/),
    ).toBeVisible();
    await userEvent.clear(cementQty);
    await userEvent.type(cementQty, "12");
    await userEvent.type(form.getByLabelText("Used Qty (cum)"), "1.5");
    await userEvent.type(
      form.getByLabelText("Remark"),
      "East wall, ground floor",
    );

    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(WORKSHEETS_API)).toHaveLength(1);
    });
    await expect(posts(WORKSHEETS_API)[0]?.body).toMatchObject({
      projectId: PROJECT_ID,
      sheetDate: TODAY,
      shift: "shift_2",
      contractorId: CONTRACTOR_ID,
      departmentId: MASONRY_ID,
      workTypeId: BRICKWORK_ID,
      skilledCount: 8,
      unskilledCount: 12,
      approxWorkQty: "42.5",
      approxWorkUnitId: SQM_ID,
      siteLocation: { type: "location", locationId: LOCATION_ID },
      remark: "East wall, ground floor",
      materials: [
        { materialId: SAND.id, quantity: "1.5" },
        { materialId: CEMENT.id, quantity: "12" },
      ],
      approve: false,
      duplicatedFromId: null,
    });
  },
};

/** A refused save shows each short material, like Current Inventory. */
export const StockRefusal: Story = {
  beforeEach: withApi({
    stock: { [CEMENT.id]: "12.000" },
    post: (call) => (call.path === WORKSHEETS_API ? stockRefusal() : undefined),
  }),
  args: { source: worksheet({ materials: [] }) },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: /^Duplicate of / }),
    );
    await userEvent.click(form.getByRole("button", { name: "Add material" }));
    await pickMaterial(form, userEvent, CEMENT.id);
    await userEvent.type(await form.findByLabelText("Used Qty (Bag)"), "30");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const alert = await form.findByRole("alert");
    await expect(alert).toHaveTextContent("Not enough stock");
    await expect(alert).toHaveTextContent("Cement OPC 53 Grade: 18 short");
  },
};

/**
 * A Project with nowhere to pick yet: the empty state is a hint and the
 * sheet saves without a location.
 */
export const NoPlacesYet: Story = {
  beforeEach: withApi({ locations: NO_PLACES }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = await newForm(canvas);
    await expect(
      await form.findByText("Nothing to locate this at yet"),
    ).toBeVisible();
    await expect(
      form.getByText(/Optional until the Project has a Wing/),
    ).toBeVisible();
    await choose(
      form,
      canvasElement,
      userEvent,
      "Contractor",
      "Velan Constructions",
    );
    await choose(
      form,
      canvasElement,
      userEvent,
      "Department",
      "Masonry & Plaster",
    );
    await choose(form, canvasElement, userEvent, "Work Shift", "Shift 1");
    await userEvent.type(form.getByLabelText("Skilled Labours"), "3");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(WORKSHEETS_API)).toHaveLength(1);
    });
    await expect(
      form.queryByText("Choose where the work was done."),
    ).toBeNull();
    await expect(posts(WORKSHEETS_API)[0]?.body).toMatchObject({
      siteLocation: null,
      skilledCount: 3,
    });
  },
};

/** Duplicate: everything but the date (today), photos and approval. */
export const Duplicate: Story = {
  args: {
    source: worksheet({ sheetDate: "2026-10-08", approvalStatus: "approved" }),
  },
  play: async ({ args, canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: /^Duplicate of / }),
    );
    await expect(form.getByLabelText("Sheet Date")).toHaveValue(TODAY);
    await expect(
      form.getByRole("combobox", { name: "Contractor" }),
    ).toHaveTextContent("Velan Constructions");
    await expect(form.getByLabelText("Skilled Labours")).toHaveValue("4");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(WORKSHEETS_API)).toHaveLength(1);
    });
    await expect(posts(WORKSHEETS_API)[0]?.body).toMatchObject({
      sheetDate: TODAY,
      materials: [{ materialId: CEMENT.id, quantity: "12" }],
      approve: false,
      duplicatedFromId: args.source?.id,
    });
  },
};

/** Save & Add New keeps the date, location, contractor and shift. */
export const SaveAndAddNew: Story = {
  args: { source: worksheet({ shift: "shift_3" }) },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: /^Duplicate of / }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save & Add New" }));
    await expect(await form.findByRole("status")).toHaveTextContent(
      /saved\. Fill in the next worksheet/,
    );
    await expect(
      form.getByRole("combobox", { name: "Contractor" }),
    ).toHaveTextContent("Velan Constructions");
    await expect(
      form.getByRole("combobox", { name: "Work Shift" }),
    ).toHaveTextContent("Shift 3");
    await expect(
      form.getByRole("combobox", { name: "Department" }),
    ).not.toHaveTextContent("Masonry");
    await expect(form.getByLabelText("Skilled Labours")).toHaveValue("");
  },
};

/** Hidden sections are not shown or checked; the order follows the settings. */
export const ConfiguredSections: Story = {
  beforeEach: withApi({
    settings: {
      showLocation: false,
      showLabour: false,
      showMaterials: false,
      sectionOrder: ["other", "basic", "location", "materials"],
      approvalEnabled: true,
    },
  }),
  play: async ({ canvas }) => {
    const form = await newForm(canvas);
    const headings = form
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    await expect(headings).toEqual(["Other Details", "Basic Details"]);
    await expect(form.queryByLabelText("Skilled Labours")).toBeNull();
    await expect(
      await form.findByRole("button", { name: "Save & Approve" }),
    ).toBeVisible();
  },
};

/** Editing sends `updatedAt`; there is no Save & Add New. */
export const Edit: Story = {
  args: { worksheet: worksheet({ number: "WS/26-27/00042" }) },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Edit WS/26-27/00042" }),
    );
    await expect(
      form.queryByRole("button", { name: "Save & Add New" }),
    ).toBeNull();
    await userEvent.click(
      form.getByRole("button", { name: "Remove material 1" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const sheet = worksheet();
    await waitFor(async () => {
      await expect(
        api.calls.mock.calls
          .map(([call]) => call)
          .find((call) => call.path.endsWith("/update"))?.body,
      ).toMatchObject({
        materials: [],
        expectedUpdatedAt: sheet.updatedAt,
      });
    });
  },
};
