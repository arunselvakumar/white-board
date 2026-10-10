import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { API, IDS, mockCentralStoreApi, STORE } from "./central-store-fixtures";
import { StoreForm } from "./store-form";

let api: ReturnType<typeof mockCentralStoreApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

const meta = {
  title: "Procurement/Central Store/Store form",
  component: StoreForm,
  beforeEach: () => {
    api = mockCentralStoreApi();
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <StoreForm {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof StoreForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A store needs a name and at least one Project; then it is saved and opened. */
export const AddStore: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add store" }),
    );
    await expect(
      await canvas.findByText("Enter the store name."),
    ).toBeVisible();
    await expect(
      canvas.getByText("Choose at least one Project."),
    ).toBeVisible();
    await expect(posts(`${API}/stores`)).toHaveLength(0);

    await userEvent.type(
      canvas.getByLabelText("Store name"),
      "Ambattur Central Store",
    );
    await userEvent.click(canvas.getByLabelText("Projects"));
    await userEvent.click(
      await body.findByRole("option", { name: "Anugraha Towers" }),
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByLabelText("Store keepers"));
    await userEvent.click(await body.findByRole("option", { name: "Selvi R" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Add store" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/workspace/central-store/${IDS.store}`,
      ),
    );
    await expect(posts(`${API}/stores`)[0]?.body).toEqual({
      name: "Ambattur Central Store",
      address: null,
      stateCode: null,
      projectIds: [IDS.tower],
      keeperIds: [IDS.keeper2],
      supplierIds: [],
    });
  },
};

/** Editing sends the `updatedAt` it loaded; a name in use shows under the field. */
export const EditNameTaken: Story = {
  args: { store: STORE },
  beforeEach: () => {
    api = mockCentralStoreApi({
      writeError: {
        status: 409,
        code: "STORE_NAME_TAKEN",
        message: "Another store already has this name.",
      },
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Store name");
    await expect(name).toHaveValue("Ambattur Central Store");
    await expect(
      canvas.getByRole("button", { name: "Remove Velachery Villas" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Another store already has this name."),
    ).toBeVisible();
    await expect(
      posts(`${API}/stores/${IDS.store}/update`)[0]?.body,
    ).toMatchObject({
      expectedUpdatedAt: STORE.updatedAt,
      projectIds: [IDS.tower, IDS.villa],
    });
  },
};
