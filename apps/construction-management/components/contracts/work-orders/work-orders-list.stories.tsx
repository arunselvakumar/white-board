import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import { pageOf, PROJECT } from "./work-order-fixtures";
import { serveWorkOrders, WORK_ORDERS_API } from "./work-order-stories-api";
import { WorkOrdersList } from "./work-orders-list";

const meta = {
  title: "Contracts/Work Orders/List",
  component: WorkOrdersList,
  args: { projectId: PROJECT, canCreate: true },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT}/work-orders` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <WorkOrdersList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof WorkOrdersList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The list in view (the table from md up, the cards below). */
async function shown(
  canvas: { findAllByLabelText: (text: string) => Promise<HTMLElement[]> },
  label: string,
): Promise<HTMLElement> {
  const found = (await canvas.findAllByLabelText(label)).find((element) =>
    element.checkVisibility(),
  );
  if (found == null) throw new Error(`${label} is not shown`);
  return found;
}

const full = serveWorkOrders();

/** Every status, drafts as “Draft”, amended ones with their revision; filter by status. */
export const List: Story = {
  beforeEach: full.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await shown(canvas, "Work Orders"));
    await expect(list.getByRole("link", { name: "Draft" })).toBeVisible();
    await expect(
      list.getByRole("link", { name: "WO/26-27/00003 · Rev 1" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/work-orders/0199c0de-1104-7000-8000-000000000103`,
    );
    await expect(list.getAllByText("₹8,33,255.00").length).toBeGreaterThan(0);
    await expect(canvas.getByText("5 Work Orders")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "New Work Order" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/work-orders/new`);
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Issued",
      }),
    );
    await waitFor(() =>
      expect(
        full.holder.current?.calls.mock.calls.some(([call]) =>
          call.path.startsWith(
            `${WORK_ORDERS_API}?projectId=${PROJECT}&status=issued`,
          ),
        ),
      ).toBe(true),
    );
    await expect(await canvas.findByText("1 Work Order")).toBeVisible();
  },
};

const empty = serveWorkOrders({ page: pageOf([]) });

/** No Work Orders yet: start the first one. */
export const Empty: Story = {
  beforeEach: empty.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Work Orders yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "New Work Order" }),
    ).toHaveLength(2);
  },
};

const phone = serveWorkOrders();

/** At phone width the Work Orders are cards and the page never scrolls sideways. */
export const PhoneWidth: Story = {
  beforeEach: phone.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const cards = within(await shown(canvas, "Work Orders"));
    await expect(cards.getByText("WO/26-27/00005")).toBeVisible();
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

const viewer = serveWorkOrders({ page: pageOf([]) });

/** A viewer without Create: no New Work Order. */
export const ReadOnly: Story = {
  args: { canCreate: false },
  beforeEach: viewer.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Work Orders yet")).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "New Work Order" }),
    ).toBeNull();
  },
};
