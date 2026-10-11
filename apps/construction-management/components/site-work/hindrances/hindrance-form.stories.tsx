import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { localToday } from "@/components/procurement/inventory/inventory-format";

import {
  CONTRACTOR_ID,
  hindrance,
  HINDRANCE_PROJECT_ID,
  HINDRANCES_API,
  mockHindranceApi,
  OWNER_ID,
  SHEET_ID,
  type HindranceApiOptions,
} from "./hindrance-fixtures";
import { HindranceForm } from "./hindrance-form";

let api: ReturnType<typeof mockHindranceApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function hindranceApi(options: HindranceApiOptions = {}) {
  return () => {
    api = mockHindranceApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${HINDRANCE_PROJECT_ID}/hindrances`;

const meta = {
  title: "Site work/Hindrances/Form",
  component: HindranceForm,
  args: { projectId: HINDRANCE_PROJECT_ID },
  beforeEach: hindranceApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <HindranceForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof HindranceForm>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

async function choose(
  formElement: HTMLElement,
  canvasElement: HTMLElement,
  label: string,
  option: string,
  userEvent: { click: (element: Element) => Promise<void> },
) {
  await userEvent.click(
    within(formElement).getByRole("combobox", { name: label }),
  );
  await userEvent.click(
    await body(canvasElement).findByRole("option", { name: option }),
  );
}

/** Cause, activity and party are required; a Contractor party needs the Contractor; sign-off is all or none. */
export const Validation: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New hindrance",
    });
    const form = within(formElement);
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(await form.findByText("Choose the cause.")).toBeVisible();
    await expect(form.getByText("Enter the affected activity.")).toBeVisible();
    await expect(form.getByText("Choose the responsible party.")).toBeVisible();
    await choose(
      formElement,
      canvasElement,
      "Responsible party",
      "Contractor",
      userEvent,
    );
    await userEvent.type(form.getByLabelText("Other party's name"), "Suresh");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose the Contractor responsible."),
    ).toBeVisible();
    await expect(
      form.getByText("Choose the date it was signed, or clear the sign-off."),
    ).toBeVisible();
    await expect(posts(HINDRANCES_API)).toHaveLength(0);
  },
};

/** A Contractor's hindrance with its joint sign-off. */
export const Save: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New hindrance",
    });
    const form = within(formElement);
    await choose(
      formElement,
      canvasElement,
      "Cause",
      "Labour shortage",
      userEvent,
    );
    await userEvent.type(
      form.getByLabelText("Affected activity"),
      "Roof slab shuttering",
    );
    await userEvent.type(form.getByLabelText("Hours lost"), "8");
    await choose(
      formElement,
      canvasElement,
      "Responsible party",
      "Contractor",
      userEvent,
    );
    await choose(
      formElement,
      canvasElement,
      "Contractor",
      "Velan Constructions",
      userEvent,
    );
    await choose(
      formElement,
      canvasElement,
      "For the Company",
      "Arun Selva Kumar (Owner)",
      userEvent,
    );
    await userEvent.type(form.getByLabelText("Other party's name"), "Ganesan");
    await userEvent.type(
      form.getByLabelText("Other party's role"),
      "Contractor's supervisor",
    );
    await userEvent.type(form.getByLabelText("Signed on"), localToday());
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(HINDRANCES_API)).toHaveLength(1);
    });
    await expect(posts(HINDRANCES_API)[0]?.body).toEqual({
      projectId: HINDRANCE_PROJECT_ID,
      startDate: localToday(),
      endDate: null,
      hoursLost: "8",
      cause: "labour_shortage",
      affectedActivity: "Roof slab shuttering",
      siteLocation: null,
      responsibleParty: "contractor",
      contractorId: CONTRACTOR_ID,
      description: null,
      equipmentUsageSheetId: null,
      signOff: {
        userId: OWNER_ID,
        partyName: "Ganesan",
        partyRole: "Contractor's supervisor",
        signedOn: localToday(),
      },
    });
  },
};

/** **Record hindrance** from a usage sheet: Equipment breakdown, its date, the sheet and the activity. */
export const PrefillFromUsageSheet: Story = {
  args: {
    prefill: {
      cause: "equipment_breakdown",
      date: "2026-10-09",
      equipmentUsageSheetId: SHEET_ID,
      activity: "Excavation with JCB 3DX",
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New hindrance",
    });
    const form = within(formElement);
    await expect(
      form.getByText("Raised from an Equipment Usage sheet."),
    ).toBeVisible();
    await expect(
      form.getByRole("combobox", { name: "Cause" }),
    ).toHaveTextContent("Equipment breakdown");
    await expect(form.getByLabelText("Start date")).toHaveValue("2026-10-09");
    await expect(form.getByLabelText("Affected activity")).toHaveValue(
      "Excavation with JCB 3DX",
    );
    await choose(
      formElement,
      canvasElement,
      "Responsible party",
      "Company",
      userEvent,
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(HINDRANCES_API)[0]?.body).toMatchObject({
        cause: "equipment_breakdown",
        startDate: "2026-10-09",
        equipmentUsageSheetId: SHEET_ID,
        responsibleParty: "company",
        contractorId: null,
      });
    });
  },
};

/** A server refusal about a field shows under it. */
export const ContractorNotOnProject: Story = {
  args: {
    hindrance: undefined,
    prefill: { cause: "labour_shortage", activity: "Plastering" },
  },
  beforeEach: hindranceApi({
    createError: {
      status: 400,
      code: "CONTRACTOR_NOT_ON_PROJECT",
      message: "Choose a Contractor assigned to this Project.",
      field: "contractorId",
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New hindrance",
    });
    const form = within(formElement);
    await choose(
      formElement,
      canvasElement,
      "Responsible party",
      "Contractor",
      userEvent,
    );
    await choose(
      formElement,
      canvasElement,
      "Contractor",
      "Velan Constructions",
      userEvent,
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose a Contractor assigned to this Project."),
    ).toBeVisible();
  },
};

/** Editing sends the hindrance's `updatedAt`; files are managed on its page. */
export const Edit: Story = {
  args: { hindrance: hindrance() },
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "Edit HR/26-27/00003",
    });
    const form = within(formElement);
    await expect(form.getByLabelText("Affected activity")).toHaveValue(
      "Roof slab shuttering, Block B",
    );
    await expect(form.queryByText(/Choose files/)).toBeNull();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const path = `${HINDRANCES_API}/0199c4a0-0000-7000-8000-0000000f1001/update`;
    await waitFor(async () => {
      await expect(posts(path)[0]?.body).toMatchObject({
        cause: "labour_shortage",
        contractorId: CONTRACTOR_ID,
        hoursLost: "16.5",
        expectedUpdatedAt: "2026-10-08T09:00:00.000Z",
      });
    });
  },
};
