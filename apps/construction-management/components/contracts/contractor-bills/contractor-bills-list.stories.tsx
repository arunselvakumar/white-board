import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  BILL_APPROVED,
  BILL_DRAFT,
  DRAFT,
  EMPTY_PAGE,
  pageOf,
  PROJECT,
  WORK_ORDER,
} from "./contractor-bill-fixtures";
import {
  CONTRACTOR_BILLS_API,
  posted,
  serveContractorBills,
} from "./contractor-bill-stories-api";
import { ContractorBillsList } from "./contractor-bills-list";

const meta = {
  title: "Contracts/Contractor Bills/List",
  component: ContractorBillsList,
  args: { projectId: PROJECT, canCreate: true },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT}/contractor-bills` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <ContractorBillsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ContractorBillsList>;

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

const full = serveContractorBills();

/** Every status with totals and the retention held per Contractor; filter by status. */
export const List: Story = {
  beforeEach: full.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await shown(canvas, "Contractor Bills"));
    await expect(list.getByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/contractor-bills/${BILL_DRAFT}`,
    );
    await expect(
      list.getAllByRole("link", { name: "CB/26-27/00002 · RA 2" })[0],
    ).toBeVisible();
    await expect(canvas.getByText("4 bills")).toBeVisible();
    const totals = within(canvas.getByRole("region", { name: "Totals" }));
    await expect(totals.getByText("₹3,15,694.00")).toBeVisible();
    const held = within(canvas.getByRole("region", { name: "Retention held" }));
    await expect(held.getByText("Velan Constructions")).toBeVisible();
    await expect(held.getByText("₹7,130.00")).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Approved",
      }),
    );
    await waitFor(() => expect(canvas.getByText("1 bill")).toBeVisible());
  },
};

const empty = serveContractorBills({ page: EMPTY_PAGE });

/** No bills yet: what a bill is, and New bill. */
export const Empty: Story = {
  beforeEach: empty.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Contractor Bills yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "New bill" }),
    ).toHaveLength(2);
  },
};

const creating = serveContractorBills({
  write: () => Response.json(DRAFT, { status: 201 }),
});

/** New bill: pick the Work Order and the date; it says how many rows it takes. */
export const NewBill: Story = {
  beforeEach: creating.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New bill" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Contractor Bill" }),
    );
    await userEvent.click(dialog.getByLabelText("Work Order"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "WO/26-27/00003 · Velan Constructions",
      }),
    );
    await expect(
      await dialog.findByText(
        "Takes 7 checked rows measured up to 22 Oct 2026.",
      ),
    ).toBeVisible();
    const upTo = dialog.getByLabelText("Measured up to");
    await userEvent.clear(upTo);
    await userEvent.type(upTo, "2026-10-15");
    await expect(
      await dialog.findByText(
        "Takes 4 checked rows measured up to 15 Oct 2026.",
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Draft bill" }));
    await waitFor(() =>
      expect(posted(creating.holder.current, CONTRACTOR_BILLS_API)).toEqual({
        projectId: PROJECT,
        workOrderId: WORK_ORDER,
        billDate: "2026-10-22",
        measuredUpTo: "2026-10-15",
      }),
    );
  },
};

const open = serveContractorBills();

/** A Work Order with a bill still open links to it instead. */
export const OpenBillOnWorkOrder: Story = {
  beforeEach: open.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New bill" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Contractor Bill" }),
    );
    await userEvent.click(dialog.getByLabelText("Work Order"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "WO/26-27/00004 · Sri Murugan Builders",
      }),
    );
    await expect(dialog.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/contractor-bills/${BILL_DRAFT}`,
    );
    await expect(
      dialog.getByText(/No checked measurements up to/),
    ).toBeVisible();
  },
};

const quantities = serveContractorBills({ page: pageOf(false) });

/** Without Financial: no totals, no money, no retention held. */
export const WithoutFinancial: Story = {
  args: { canCreate: false },
  beforeEach: quantities.beforeEach,
  play: async ({ canvas }) => {
    await shown(canvas, "Contractor Bills");
    await expect(canvas.queryByText(/₹/)).toBeNull();
    await expect(canvas.queryByRole("region", { name: "Totals" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "New bill" })).toBeNull();
  },
};

const phone = serveContractorBills();

/** At phone width each bill is a card and nothing scrolls sideways. */
export const PhoneWidth: Story = {
  beforeEach: phone.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const cards = within(await shown(canvas, "Contractor Bills"));
    await expect(
      cards.getByRole("link", { name: "CB/26-27/00002 · RA 2" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/contractor-bills/${BILL_APPROVED}`,
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
