import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { EditOtherPartyScreen, NewOtherPartyScreen } from "./other-party-form";
import {
  LAKSHMI,
  MURUGAN,
  PROJECT_OPTIONS,
  TOWER_A,
  VILLA,
} from "./other-party-fixtures";

const API = "/api/construction/finance/other-parties";

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
      if (call.method === "GET" && call.path.endsWith("/projects/options"))
        return Response.json({ items: PROJECT_OPTIONS });
      if (call.method === "GET" && call.path === `${API}/${MURUGAN.id}`)
        return Response.json(MURUGAN);
      if (call.method === "POST") return write(call);
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Finance/Other Parties/Form",
  component: NewOtherPartyScreen,
  render: () => (
    <StoryQueries>
      <NewOtherPartyScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewOtherPartyScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Checks the fields, lets the GSTIN fill the state, and sends the Projects. */
export const AddOtherParty: Story = {
  beforeEach: serve((call) =>
    call.path === API ? Response.json(LAKSHMI, { status: 201 }) : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Add Other Party" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText("Enter the name")).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(
      canvas.getByLabelText("Party name"),
      "Sri Lakshmi Traders",
    );
    await userEvent.type(canvas.getByLabelText("Mobile"), "123");
    await userEvent.type(canvas.getByLabelText("PAN"), "AAACB1234C");
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await expect(canvas.getByLabelText("GST state")).toHaveTextContent(
      "Tamil Nadu (33)",
    );
    await expect(canvas.getByText("From the GSTIN")).toBeVisible();
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
    await userEvent.type(canvas.getByLabelText("Email"), "accounts@lakshmi.in");
    await userEvent.click(
      await canvas.findByRole("checkbox", { name: "Tower A" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        "/app/masters/other-parties",
      ),
    );
    await expect(posted(API)).toEqual({
      name: "Sri Lakshmi Traders",
      mobile: "77081 65767",
      email: "accounts@lakshmi.in",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      stateCode: "33",
      address: null,
      projectIds: [TOWER_A.id],
    });
  },
};

/** A name in use comes back under the name field. */
export const NameTaken: Story = {
  beforeEach: serve(() =>
    Response.json(
      {
        code: "OTHER_PARTY_NAME_TAKEN",
        message: "An Other Party named “Landlord Murugan” already exists.",
        details: { field: "name" },
      },
      { status: 409 },
    ),
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Party name"),
      "landlord murugan",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(await canvas.findByText(/already exists/)).toBeVisible();
    await expect(canvas.getByLabelText("Party name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

/** Edit loads the party, keeps its Projects and sends `expectedUpdatedAt`. */
export const EditOtherParty: Story = {
  render: () => (
    <StoryQueries>
      <EditOtherPartyScreen id={MURUGAN.id} />
    </StoryQueries>
  ),
  beforeEach: serve((call) =>
    call.path === `${API}/${MURUGAN.id}/update`
      ? Response.json(MURUGAN)
      : undefined,
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Landlord Murugan" }),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("checkbox", { name: "Villa Phase 2" }),
    ).toBeChecked();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Tower A" }));
    await userEvent.type(canvas.getByLabelText("Address"), "Anna Nagar");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(posted(`${API}/${MURUGAN.id}/update`)).toEqual({
        name: "Landlord Murugan",
        mobile: null,
        email: null,
        gstin: null,
        pan: null,
        stateCode: null,
        address: "Anna Nagar",
        projectIds: [VILLA.id],
        expectedUpdatedAt: MURUGAN.updatedAt,
      }),
    );
  },
};
