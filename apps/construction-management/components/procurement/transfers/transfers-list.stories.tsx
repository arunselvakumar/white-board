import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  mockTransferApi,
  TOWER,
  TRANSFERS_API,
  type TransferApiOptions,
} from "./transfer-fixtures";
import { TransfersList } from "./transfers-list";

let api: ReturnType<typeof mockTransferApi>;

function listCalls(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "GET" && call.path.startsWith(`${TRANSFERS_API}?`),
    );
}

function transferApi(options: TransferApiOptions = {}) {
  return () => {
    api = mockTransferApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${TOWER.id}/materials/transfers`;

const meta = {
  title: "Procurement/Material Transfers/List",
  component: TransfersList,
  args: {
    location: { kind: "project", id: TOWER.id },
    hrefFor: (id: string) => `${BASE}/${id}`,
    newHref: `${BASE}/new`,
  },
  beforeEach: transferApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <TransfersList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TransfersList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both directions, newest first, with status, other side and who. */
export const List: Story = {
  play: async ({ canvas, canvasElement }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Material Transfers" }),
    );
    const items = list.getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    await expect(items[0]).toHaveTextContent("MT/26-27/00004");
    await expect(items[0]).toHaveTextContent("To Villa Phase 2");
    await expect(items[0]).toHaveTextContent("Pending");
    await expect(items[0]).toHaveTextContent(
      "Cement OPC 53 Grade · 40 Bag +1 more",
    );
    await expect(items[1]).toHaveTextContent("From Ambattur Central Store");
    await expect(items[1]).toHaveTextContent("In transit");
    await expect(items[2]).toHaveTextContent("Received by Anitha S");
    await expect(
      list.getByRole("link", { name: "MT/26-27/00004" }),
    ).toHaveAttribute("href", `${BASE}/0199c4a0-0000-7000-8000-0000000a0001`);
    await expect(
      canvas.getByRole("link", { name: "New transfer" }),
    ).toHaveAttribute("href", `${BASE}/new`);
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Direction and status filters go to the server. */
export const Filters: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Material Transfers" });
    await userEvent.click(canvas.getByRole("button", { name: "Received" }));
    await waitFor(async () => {
      await expect(listCalls().at(-1)?.path).toContain("direction=in");
    });
    await expect(await canvas.findByText("1 transfer")).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Status" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Delivered",
      }),
    );
    await expect(await canvas.findByText("No transfers match")).toBeVisible();
    await expect(listCalls().at(-1)?.path).toContain("status=delivered");
  },
};

/** No transfers yet, with the way to raise one. */
export const Empty: Story = {
  beforeEach: transferApi({ transfers: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No material transfers yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "New transfer" }),
    ).toHaveLength(2);
  },
};

/** Without Create, no New transfer. */
export const ReadOnly: Story = {
  beforeEach: transferApi({
    flags: { "procurement.material_transfers": ["read"] },
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Material Transfers" });
    await expect(
      canvas.queryByRole("link", { name: "New transfer" }),
    ).toBeNull();
  },
};
