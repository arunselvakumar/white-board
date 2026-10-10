import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  CEMENT_ID,
  mockTransferApi,
  STEEL_ID,
  TOWER,
  transfer,
  TRANSFERS_API,
  VILLA,
  type TransferApiOptions,
} from "./transfer-fixtures";
import { TransferForm } from "./transfer-form";

let api: ReturnType<typeof mockTransferApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function transferApi(options: TransferApiOptions = {}) {
  return () => {
    api = mockTransferApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${TOWER.id}/materials/transfers`;

const meta = {
  title: "Procurement/Material Transfers/Form",
  component: TransferForm,
  args: {
    defaultFrom: { kind: "project", id: TOWER.id },
    hrefFor: (id: string) => `${BASE}/${id}`,
  },
  beforeEach: transferApi({
    stock: { [CEMENT_ID]: "42.000", [STEEL_ID]: "2450.500" },
  }),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <TransferForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof TransferForm>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Lines need a material and a quantity; the source and destination differ. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Material Transfer" }),
    );
    await expect(
      form.getByRole("combobox", { name: "From" }),
    ).toHaveTextContent("Anugraha Towers");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Choose where the material goes to."),
    ).toBeVisible();
    await expect(form.getByText("Choose a material.")).toBeVisible();
    await expect(posts(TRANSFERS_API)).toHaveLength(0);
  },
};

/** Save: pending, with available stock shown and a warning when short. */
export const Save: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Material Transfer" }),
    );
    await userEvent.click(form.getByRole("combobox", { name: "To" }));
    const listbox = body(canvasElement);
    await expect(
      listbox.queryByRole("option", { name: "Anugraha Towers" }),
    ).toBeNull();
    await userEvent.click(
      await listbox.findByRole("option", { name: "Villa Phase 2" }),
    );
    await userEvent.selectOptions(form.getByLabelText("Material"), CEMENT_ID);
    await expect(await form.findByText("Available: 42 Bag")).toBeVisible();
    await userEvent.type(form.getByLabelText("Quantity (Bag)"), "50");
    await expect(await form.findByText(/not enough to approve/)).toBeVisible();
    await userEvent.clear(form.getByLabelText("Quantity (Bag)"));
    await userEvent.type(form.getByLabelText("Quantity (Bag)"), "30");
    await userEvent.type(form.getByLabelText("Receiver Name"), "Murugan");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(TRANSFERS_API)).toHaveLength(1);
    });
    await expect(posts(TRANSFERS_API)[0]?.body).toMatchObject({
      from: { kind: "project", id: TOWER.id },
      to: { kind: "project", id: VILLA.id },
      lines: [{ materialId: CEMENT_ID, quantity: "30", remark: null }],
      receiverName: "Murugan",
      approve: false,
    });
  },
};

/** Save & Approve for members who may approve at the source; starts from chosen materials. */
export const SaveAndApprove: Story = {
  args: { materialIds: [STEEL_ID] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Material Transfer" }),
    );
    await waitFor(async () => {
      await expect(form.getByLabelText("Material")).toHaveValue(STEEL_ID);
    });
    await userEvent.click(form.getByRole("combobox", { name: "To" }));
    await userEvent.click(
      await body(canvasElement).findByRole("option", {
        name: "Ambattur Central Store",
      }),
    );
    await userEvent.type(form.getByLabelText(/^Quantity/), "500");
    await userEvent.click(
      await form.findByRole("button", { name: "Save & Approve" }),
    );
    await waitFor(async () => {
      await expect(posts(TRANSFERS_API)[0]?.body).toMatchObject({
        to: { kind: "store" },
        approve: true,
      });
    });
  },
};

/** Without Approve at the source there is no Save & Approve. */
export const NoApprove: Story = {
  beforeEach: transferApi({
    flags: { "procurement.material_transfers": ["read", "create"] },
  }),
  play: async ({ canvas }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Material Transfer" }),
    );
    await expect(form.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(
      form.queryByRole("button", { name: "Save & Approve" }),
    ).toBeNull();
  },
};

/** Editing a pending transfer sends its `updatedAt`. */
export const Edit: Story = {
  args: { transfer: transfer() },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Edit MT/26-27/00004" }),
    );
    await expect(form.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      form.queryByRole("button", { name: "Save & Approve" }),
    ).toBeNull();
    await userEvent.click(
      form.getByRole("button", { name: "Remove material 2" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const path = `${TRANSFERS_API}/0199c4a0-0000-7000-8000-0000000a0001/update`;
    await waitFor(async () => {
      await expect(posts(path)[0]?.body).toMatchObject({
        lines: [{ materialId: CEMENT_ID, quantity: "40" }],
        expectedUpdatedAt: "2026-10-05T09:00:00.000Z",
      });
    });
  },
};
