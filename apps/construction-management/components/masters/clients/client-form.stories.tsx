import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { BALAJI, HIGHWAYS } from "./client-fixtures";
import { EditClientScreen, NewClientScreen } from "./client-form";

const API = "/api/construction/masters/clients";

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown {
  return api.calls.mock.calls
    .map(([call]) => call)
    .find((call) => call.method === "POST" && call.path === path)?.body;
}

function posts(): number {
  return api.calls.mock.calls.filter(([call]) => call.method === "POST").length;
}

function serve(write: (call: ApiCall) => Response | undefined) {
  return () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === `${API}/${HIGHWAYS.id}`)
        return Response.json(HIGHWAYS);
      if (call.method === "POST") return write(call);
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Clients/Form",
  component: NewClientScreen,
  render: () => (
    <StoryQueries>
      <NewClientScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewClientScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Checks the fields, lets the GSTIN fill the state, and sends the form. */
export const AddClient: Story = {
  beforeEach: serve((call) =>
    call.path === API ? Response.json(BALAJI, { status: 201 }) : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Add Client" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Client's name"),
    ).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(
      canvas.getByLabelText("Client name"),
      "Sri Balaji Developers",
    );
    await userEvent.type(canvas.getByLabelText("PIN code"), "6000");
    await userEvent.type(canvas.getByLabelText("TAN"), "CHEA1234");
    await userEvent.type(canvas.getByLabelText("PAN"), "AAACB1234C");
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await expect(canvas.getByLabelText("GST state")).toHaveTextContent(
      "Tamil Nadu (33)",
    );
    await expect(canvas.getByText("From the GSTIN")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the 6-digit PIN code"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter a valid TAN, like CHEA12345B"),
    ).toBeVisible();
    await expect(
      canvas.getByText("The GSTIN must contain this PAN"),
    ).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(canvas.getByLabelText("PIN code"), "02");
    await userEvent.type(canvas.getByLabelText("TAN"), "5B");
    await userEvent.clear(canvas.getByLabelText("PAN"));
    await userEvent.type(canvas.getByLabelText("PAN"), "AAPFA0939F");
    await userEvent.type(canvas.getByLabelText("Contact person"), "Ravi Kumar");
    await userEvent.type(canvas.getByLabelText("Mobile"), "77081 65767");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/masters/clients"),
    );
    await expect(posted(API)).toEqual({
      name: "Sri Balaji Developers",
      contactPerson: "Ravi Kumar",
      mobile: "77081 65767",
      email: null,
      address: null,
      pinCode: "600002",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      tan: "CHEA12345B",
      stateCode: "33",
      isActive: true,
    });
  },
};

/** A name in use comes back under the name field. */
export const NameTaken: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "CLIENT_NAME_TAKEN",
        message: "A Client named “Sri Balaji Developers” already exists.",
        details: { field: "name" },
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Client name"),
      "sri balaji developers",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/already exists/)).toBeVisible();
    await expect(canvas.getByLabelText("Client name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

/** Edit loads the Client, keeps the picked state, turns it active and sends `expectedUpdatedAt`. */
export const EditClient: Story = {
  render: () => (
    <StoryQueries>
      <EditClientScreen id={HIGHWAYS.id} />
    </StoryQueries>
  ),
  beforeEach: serve((call) =>
    call.path === `${API}/${HIGHWAYS.id}/update`
      ? Response.json(HIGHWAYS)
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Highways Department" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("GST state")).toHaveTextContent(
      "Karnataka (29)",
    );
    const active = canvas.getByRole("switch", { name: "Active" });
    await expect(active).not.toBeChecked();
    await userEvent.click(active);
    await userEvent.type(
      canvas.getByLabelText("Billing address"),
      "KR Circle, Bengaluru",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted(`${API}/${HIGHWAYS.id}/update`)).toEqual({
        name: "Highways Department",
        contactPerson: null,
        mobile: null,
        email: null,
        address: "KR Circle, Bengaluru",
        pinCode: null,
        gstin: null,
        pan: null,
        tan: null,
        stateCode: "29",
        isActive: true,
        expectedUpdatedAt: HIGHWAYS.updatedAt,
      }),
    );
  },
};
