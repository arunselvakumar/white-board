import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  CONTRACTOR_ID,
  CULVERT_ID,
  DEPARTMENT_ID,
  DRAWING_ID,
  INSPECTION_PROJECT_ID,
  INSPECTIONS_API,
  INSPECTOR_ID,
  inspection,
  mockInspectionApi,
  REINSPECTION_DRAFT,
  REJECTED_ID,
  type InspectionApiOptions,
} from "./inspection-fixtures";
import { InspectionForm } from "./inspection-form";

let api: ReturnType<typeof mockInspectionApi>;

function inspectionApi(options: InspectionApiOptions = {}) {
  return () => {
    api = mockInspectionApi(options);
    return api.restore;
  };
}

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

const BASE = `/app/projects/${INSPECTION_PROJECT_ID}/inspections`;

const meta = {
  title: "Tracking/Inspections/Form",
  component: InspectionForm,
  args: { projectId: INSPECTION_PROJECT_ID, today: "2026-10-14" },
  beforeEach: inspectionApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <InspectionForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof InspectionForm>;

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

/** The description of work is required; the time must be HH:MM. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New Inspection Request",
    });
    const form = within(formElement);
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Describe the work to inspect."),
    ).toBeVisible();
    await expect(posts(INSPECTIONS_API)).toHaveLength(0);
  },
};

/** A request for the inspector, with a contractor, location and a linked drawing. */
export const Save: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New Inspection Request",
    });
    const form = within(formElement);
    await expect(form.getByLabelText("Inspection Date")).toHaveValue(
      "2026-10-14",
    );
    await userEvent.type(form.getByLabelText("Inspection Time"), "1030AM");
    await choose(
      formElement,
      canvasElement,
      "Inspector",
      "Meena Iyer",
      userEvent,
    );
    await choose(formElement, canvasElement, "Department", "Civil", userEvent);
    await choose(
      formElement,
      canvasElement,
      "Contractor",
      "Velan Constructions",
      userEvent,
    );
    await userEvent.type(
      form.getByLabelText("Description of work"),
      "Slab reinforcement before the pour",
    );
    await choose(
      formElement,
      canvasElement,
      "Location",
      "Culvert C3",
      userEvent,
    );
    await userEvent.click(form.getByLabelText("Linked drawings"));
    await userEvent.click(
      await body(canvasElement).findByRole("option", {
        name: "Structural · Ground floor slab (R2)",
      }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(INSPECTIONS_API)).toHaveLength(1);
    });
    await expect(posts(INSPECTIONS_API)[0]?.body).toEqual({
      projectId: INSPECTION_PROJECT_ID,
      reinspectionOfId: null,
      inspectionDate: "2026-10-14",
      inspectionTime: "10:30",
      departmentId: DEPARTMENT_ID,
      contractorId: CONTRACTOR_ID,
      inspectorMemberId: INSPECTOR_ID,
      workDescription: "Slab reinforcement before the pour",
      siteLocation: { type: "location", locationId: CULVERT_ID },
      drawingIds: [DRAWING_ID],
    });
    // Stays busy until the request's page opens.
    await expect(form.getByRole("button", { name: "Saving…" })).toBeDisabled();
  },
};

/** **Raise re-inspection**: prefilled from the rejected request and linked to it. */
export const Reinspection: Story = {
  args: {
    reinspection: REINSPECTION_DRAFT,
    reinspectionOfNumber: "IR/26-27/00002",
  },
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New Inspection Request",
    });
    const form = within(formElement);
    await expect(
      form.getByText("Re-inspection of IR/26-27/00002, which was rejected."),
    ).toBeVisible();
    await expect(form.getByLabelText("Description of work")).toHaveValue(
      "Waterproofing of the terrace",
    );
    await expect(
      form.getByRole("combobox", { name: "Inspector" }),
    ).toHaveTextContent("Meena Iyer");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(INSPECTIONS_API)[0]?.body).toMatchObject({
        reinspectionOfId: REJECTED_ID,
        contractorId: CONTRACTOR_ID,
        drawingIds: [DRAWING_ID],
      });
    });
  },
};

/** Editing a pending request sends what it last saw. */
export const Edit: Story = {
  args: { inspection: inspection() },
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "Edit IR/26-27/00004",
    });
    const form = within(formElement);
    await expect(form.getByLabelText("Inspection Time")).toHaveValue("10:30");
    await expect(form.queryByText("Drawings and site photographs")).toBeNull();
    const work = form.getByLabelText("Description of work");
    await userEvent.clear(work);
    await userEvent.type(work, "Slab reinforcement, Block B");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(
        posts(`${INSPECTIONS_API}/${inspection().id}/update`)[0]?.body,
      ).toMatchObject({
        workDescription: "Slab reinforcement, Block B",
        expectedUpdatedAt: inspection().updatedAt,
      });
    });
  },
};

/** A back-dated refusal is shown under the date. */
export const BackdatedRefusal: Story = {
  beforeEach: inspectionApi({
    createError: {
      status: 403,
      code: "BACKDATED_CREATE_BLOCKED",
      message: "You can enter Inspection Requests at most 3 days back.",
    },
  }),
  play: async ({ canvas, userEvent }) => {
    const formElement = await canvas.findByRole("form", {
      name: "New Inspection Request",
    });
    const form = within(formElement);
    await userEvent.type(
      form.getByLabelText("Description of work"),
      "Footings",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(
        "You can enter Inspection Requests at most 3 days back.",
      ),
    ).toBeVisible();
    await expect(form.getByRole("button", { name: "Save" })).toBeEnabled();
  },
};
