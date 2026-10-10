import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import { StoryQueryClient } from "@/components/designations/designation-story-support";

import { mockFetch } from "../../.storybook/mock-fetch";
import { EditPartyScreen, NewPartyScreen } from "./party-form";
import {
  BALAJI,
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
      projectIds: [TOWER_A.id],
      departmentIds: [RCC.id],
    });
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
