import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { EditPartyScreen, NewPartyScreen } from "./party-form";
import {
  BALAJI,
  BALAJI_QUOTATIONS,
  DEPARTMENT_LIST,
  KAVERI,
  PAINTING,
  PLUMBING,
  PROJECT_OPTIONS,
  RCC,
  TOWER_A,
} from "./party-fixtures";

const CONTRACTORS = "/api/construction/masters/contractors";
const SUPPLIERS = "/api/construction/masters/suppliers";

let api: ReturnType<typeof mockFetch>;

function sent(path: string): unknown {
  const call = api.spy.mock.calls.find(
    ([input, init]) => init?.method === "POST" && input === path,
  );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

function posts(): number {
  return api.spy.mock.calls.filter(([, init]) => init?.method === "POST")
    .length;
}

const LOOKUPS = [
  {
    path: "/api/construction/projects/projects/options",
    respond: () => Response.json({ items: PROJECT_OPTIONS }),
  },
  {
    path: "/api/construction/masters/departments",
    respond: () => Response.json(DEPARTMENT_LIST),
  },
];

/** Edit pages list the party's quotations under the form. */
function quotationsOf(path: string, items = BALAJI_QUOTATIONS) {
  return {
    path: `${path}/quotations`,
    respond: () => Response.json({ items }),
  };
}

const meta = {
  title: "Masters/Parties/Form",
  component: NewPartyScreen,
  args: { list: "contractors" },
  render: (args) => (
    <StoryQueryClient>
      <NewPartyScreen {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof NewPartyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddContractor: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: CONTRACTORS,
        respond: () => Response.json(BALAJI, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Add Contractor" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Enter the name")).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(
      canvas.getByLabelText("Contractor name"),
      "Sri Balaji Constructions",
    );
    await userEvent.type(canvas.getByLabelText("Mobile"), "12345");
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await userEvent.type(canvas.getByLabelText("PAN"), "AAACB1234C");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter a valid 10-digit mobile number"),
    ).toBeVisible();
    await expect(
      canvas.getByText("The GSTIN must contain this PAN"),
    ).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.clear(canvas.getByLabelText("Mobile"));
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.clear(canvas.getByLabelText("PAN"));
    await userEvent.type(canvas.getByLabelText("PAN"), "AAPFA0939F");
    await userEvent.type(canvas.getByLabelText("Contact person"), "Murugan");
    await userEvent.type(canvas.getByLabelText("Contact person 2"), "Senthil");
    await userEvent.type(canvas.getByLabelText("Mobile 2"), "98400");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter a valid 10-digit mobile number"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Mobile 2")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(posts()).toBe(0);
    await userEvent.type(canvas.getByLabelText("Mobile 2"), " 56789");
    // A disabled Department is not offered for a new Contractor.
    await userEvent.click(await canvas.findByRole("checkbox", { name: "RCC" }));
    await expect(
      canvas.queryByRole("checkbox", { name: /Painting/ }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Tower A" }));

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/contractors"),
    );
    await expect(sent(CONTRACTORS)).toEqual({
      name: "Sri Balaji Constructions",
      contactPerson: "Murugan",
      mobile: "77081 65767",
      email: null,
      address: null,
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      stateCode: "33",
      contactPerson2: "Senthil",
      mobile2: "98400 56789",
      projectIds: [TOWER_A.id],
      departmentIds: [RCC.id],
    });
    // Quotations wait until the Contractor is saved.
    await expect(
      canvas.getByText("Save the Contractor first to add quotations."),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Upload quotation" }),
    ).toBeNull();
  },
};

/** A valid GSTIN fills the GST state from its first two digits and locks it. */
export const AddSupplierGstinFillsState: Story = {
  args: { list: "suppliers" },
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: SUPPLIERS,
        respond: () => Response.json(KAVERI, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Supplier name"),
      "Kaveri Cements",
    );
    // Suppliers have one contact.
    await expect(canvas.queryByLabelText("Contact person 2")).toBeNull();
    const state = canvas.getByLabelText("GST state");
    await expect(state).toHaveTextContent("Not set");
    await expect(canvas.queryByText("From the GSTIN")).toBeNull();

    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await expect(state).toHaveTextContent("Tamil Nadu (33)");
    await expect(canvas.getByText("From the GSTIN")).toBeVisible();
    await expect(state).toHaveAttribute("data-disabled");

    // A GSTIN cut short frees the state again, keeping the pick.
    await userEvent.type(canvas.getByLabelText("GSTIN"), "{Backspace}");
    await expect(canvas.queryByText("From the GSTIN")).toBeNull();
    await expect(state).toHaveTextContent("Tamil Nadu (33)");
    await expect(state).not.toHaveAttribute("data-disabled");
    await userEvent.type(canvas.getByLabelText("GSTIN"), "M");

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/suppliers"),
    );
    const body = sent(SUPPLIERS) as Record<string, unknown>;
    await expect(body).toMatchObject({
      gstin: "33AAPFA0939F1ZM",
      stateCode: "33",
    });
    await expect(body).not.toHaveProperty("contactPerson2");
    await expect(body).not.toHaveProperty("mobile2");
    await expect(body).not.toHaveProperty("departmentIds");
  },
};

/** Without a GSTIN the state is picked from the list. */
export const AddSupplierPicksState: Story = {
  args: { list: "suppliers" },
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: SUPPLIERS,
        respond: () => Response.json(KAVERI, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByLabelText("Supplier name"),
      "Kaveri Cements",
    );
    const state = canvas.getByLabelText("GST state");
    await userEvent.click(state);
    await userEvent.click(
      await body.findByRole("option", { name: "Karnataka (29)" }),
    );
    await expect(state).toHaveTextContent("Karnataka (29)");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/suppliers"),
    );
    await expect(sent(SUPPLIERS)).toMatchObject({
      gstin: null,
      stateCode: "29",
    });
  },
};

/** The server's GSTIN_STATE_MISMATCH shows under the GST state. */
export const StateMismatch: Story = {
  args: { list: "suppliers" },
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: SUPPLIERS,
        respond: () =>
          Response.json(
            {
              code: "GSTIN_STATE_MISMATCH",
              message:
                "The GSTIN is registered in another state (code 33). Pick that state, or leave the state to follow the GSTIN.",
            },
            { status: 400 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Supplier name"),
      "Kaveri Cements",
    );
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "The GSTIN is registered in another state (code 33). Pick that state, or leave the state to follow the GSTIN.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("GST state")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    // On the field, not as a form-level message.
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const EditContractor: Story = {
  render: () => (
    <StoryQueryClient>
      <EditPartyScreen list="contractors" id={BALAJI.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        path: `${CONTRACTORS}/${BALAJI.id}`,
        respond: () => Response.json(BALAJI),
      },
      quotationsOf(`${CONTRACTORS}/${BALAJI.id}`),
      {
        method: "POST",
        path: `${CONTRACTORS}/${BALAJI.id}/update`,
        respond: () => Response.json(BALAJI),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", {
        name: "Edit Sri Balaji Constructions",
      }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Mobile")).toHaveValue("7708165767");
    await expect(canvas.getByLabelText("Contact person 2")).toHaveValue(
      "Senthil",
    );
    await expect(canvas.getByLabelText("Mobile 2")).toHaveValue("9840056789");
    await expect(canvas.getByLabelText("GST state")).toHaveTextContent(
      "Tamil Nadu (33)",
    );
    await expect(canvas.getByText("From the GSTIN")).toBeVisible();
    // The saved Contractor's quotations sit under the form.
    const quotations = within(
      await canvas.findByRole("list", { name: "Quotations" }),
    );
    await expect(quotations.getAllByRole("listitem")).toHaveLength(2);
    // A Department disabled since stays ticked and labelled.
    await expect(
      await canvas.findByRole("checkbox", { name: "Painting (disabled)" }),
    ).toBeChecked();
    await expect(
      canvas.getByRole("checkbox", { name: "Villa Phase 2" }),
    ).toBeChecked();

    await userEvent.click(canvas.getByRole("checkbox", { name: "Plumbing" }));
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Villa Phase 2" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/contractors"),
    );
    await expect(sent(`${CONTRACTORS}/${BALAJI.id}/update`)).toMatchObject({
      name: BALAJI.name,
      mobile: "7708165767",
      stateCode: "33",
      contactPerson2: "Senthil",
      mobile2: "9840056789",
      departmentIds: [PAINTING.id, RCC.id, PLUMBING.id],
      projectIds: [TOWER_A.id],
      expectedUpdatedAt: BALAJI.updatedAt,
    });
  },
};

export const EditSupplierNameTaken: Story = {
  render: () => (
    <StoryQueryClient>
      <EditPartyScreen list="suppliers" id={KAVERI.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        path: `${SUPPLIERS}/${KAVERI.id}`,
        respond: () => Response.json(KAVERI),
      },
      quotationsOf(`${SUPPLIERS}/${KAVERI.id}`, []),
      {
        method: "POST",
        path: `${SUPPLIERS}/${KAVERI.id}/update`,
        respond: () =>
          Response.json(
            {
              code: "SUPPLIER_NAME_IN_USE",
              message: "A Supplier with this name already exists.",
            },
            { status: 409 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Kaveri Cements" }),
    ).toBeVisible();
    // Suppliers have no Departments.
    await expect(
      canvas.queryByRole("heading", { name: "Departments" }),
    ).toBeNull();
    const name = canvas.getByLabelText("Supplier name");
    await userEvent.clear(name);
    await userEvent.type(name, "Ramco Steel");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("A Supplier with this name already exists."),
    ).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const body = sent(`${SUPPLIERS}/${KAVERI.id}/update`) as Record<
      string,
      unknown
    >;
    await expect(body).not.toHaveProperty("departmentIds");
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};
