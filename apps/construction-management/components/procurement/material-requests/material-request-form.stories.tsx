import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  API,
  IDS,
  mockCentralStoreApi,
} from "@/components/procurement/stores/central-store-fixtures";

import { MaterialRequestForm } from "./material-request-form";

let api: ReturnType<typeof mockCentralStoreApi>;

function posts(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === `${API}/material-requests`);
}

const meta = {
  title: "Procurement/Central Store/Material Request form",
  component: MaterialRequestForm,
  args: { projectId: IDS.tower },
  beforeEach: () => {
    api = mockCentralStoreApi();
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <MaterialRequestForm {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MaterialRequestForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The only store serving the Project is chosen; a line needs a material
 * and an Ask Qty above 0; the request is raised and opened.
 */
export const RaiseRequest: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Raise Material Request" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Request To")).toHaveTextContent(
      "Ambattur Central Store",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Raise request" }));
    await expect(await canvas.findByText("Choose a material.")).toBeVisible();
    await expect(posts()).toHaveLength(0);

    await canvas.findByRole("option", { name: "Cement OPC 53 Grade (Bag)" });
    await userEvent.selectOptions(
      canvas.getByLabelText("Material"),
      "Cement OPC 53 Grade (Bag)",
    );
    await userEvent.type(canvas.getByLabelText(/Ask Qty/), "0");
    await userEvent.click(canvas.getByRole("button", { name: "Raise request" }));
    await expect(await canvas.findByText("Ask Qty must be more than 0.")).toBeVisible();
    await userEvent.clear(canvas.getByLabelText(/Ask Qty/));
    await userEvent.type(canvas.getByLabelText(/Ask Qty/), "100");
    await userEvent.type(canvas.getByLabelText("Receiver Name"), "Prabhu S");
    await userEvent.click(canvas.getByRole("button", { name: "Raise request" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${IDS.tower}/materials/material-requests/${IDS.request}`,
      ),
    );
    await expect(posts()[0]?.body).toMatchObject({
      projectId: IDS.tower,
      storeId: IDS.store,
      contractorId: null,
      receiverName: "Prabhu S",
      items: [{ materialId: IDS.cement, askQty: "100", remark: null }],
    });
  },
};

/** A store refusal from the server shows under Request To. */
export const StoreNotOnProject: Story = {
  beforeEach: () => {
    api = mockCentralStoreApi({
      writeError: {
        status: 400,
        code: "STORE_NOT_ON_PROJECT",
        message: "This store does not serve the Project. Choose a store assigned to it.",
      },
    });
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    within(canvasElement);
    await canvas.findByRole("option", { name: "M Sand (cum)" });
    await userEvent.selectOptions(canvas.getByLabelText("Material"), "M Sand (cum)");
    await userEvent.type(canvas.getByLabelText(/Ask Qty/), "4.5");
    await userEvent.click(canvas.getByRole("button", { name: "Raise request" }));
    await expect(
      await canvas.findByText(
        "This store does not serve the Project. Choose a store assigned to it.",
      ),
    ).toBeVisible();
  },
};
