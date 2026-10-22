import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  BILL_APPROVED,
  BILL_DRAFT,
  CONTRACT,
  DRAFT,
  emptyPage,
  NO_CLIENT,
  NO_STATE,
  OWN_DEVELOPMENT,
  pageOf,
  PROJECT,
} from "./client-bill-fixtures";
import {
  CLIENT_BILLS_API,
  posted,
  serveClientBills,
} from "./client-bill-stories-api";
import { ClientBillsList } from "./client-bills-list";

const meta = {
  title: "Contracts/Client Bills/List",
  component: ClientBillsList,
  args: { projectId: PROJECT, canCreate: true },
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT}/client-bills` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <ClientBillsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ClientBillsList>;

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

const full = serveClientBills();

/** Every status with totals and the retention receivable; the terms below; filter by status. */
export const List: Story = {
  beforeEach: full.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(await shown(canvas, "Client Bills"));
    await expect(list.getByRole("link", { name: "Draft" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/client-bills/${BILL_DRAFT}`,
    );
    await expect(
      list.getAllByRole("link", { name: "RA/26-27/00002 · RA 2" })[0],
    ).toBeVisible();
    await expect(
      canvas.getByText("4 bills to Tamil Nadu Housing Board"),
    ).toBeVisible();
    const totals = within(canvas.getByRole("region", { name: "Totals" }));
    await expect(totals.getByText("₹19,78,940.55")).toBeVisible();
    await expect(totals.getByText("Retention receivable")).toBeVisible();
    await expect(totals.getByText("₹1,35,878.41")).toBeVisible();
    const terms = within(
      await canvas.findByRole("region", { name: "Client contract terms" }),
    );
    await expect(terms.getByText("10% per bill")).toBeVisible();
    await expect(terms.getByText("9954")).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Approved",
      }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText("1 bill to Tamil Nadu Housing Board"),
      ).toBeVisible(),
    );
  },
};

const ownDevelopment = serveClientBills({ page: emptyPage(OWN_DEVELOPMENT) });

/** Own development: the BOQ is a budget; a link to change the Project's role. */
export const NotContractWork: Story = {
  beforeEach: ownDevelopment.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("This Project is Own development"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Change the Project's role" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/edit`);
    await expect(canvas.getByText(/Then also: pick the client/)).toBeVisible();
  },
};

const noClient = serveClientBills({ page: emptyPage(NO_CLIENT) });

/** No Client linked: a link to pick it on the Project. */
export const NoClientLinked: Story = {
  beforeEach: noClient.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Client linked")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Pick the Client" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/edit`);
  },
};

const noState = serveClientBills({ page: emptyPage(NO_STATE) });

/** No Project state: the place of supply is missing; a link to set it. */
export const NoProjectState: Story = {
  beforeEach: noState.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Project state")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Set the Project's state" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT}/edit`);
  },
};

const empty = serveClientBills({ page: emptyPage() });

/** Ready but no bills yet: what a bill is, and New bill. */
export const Empty: Story = {
  beforeEach: empty.beforeEach,
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Client Bills yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "New bill" }),
    ).toHaveLength(2);
  },
};

const creating = serveClientBills({
  write: (call) =>
    call.path === CLIENT_BILLS_API
      ? Response.json(DRAFT, { status: 201 })
      : undefined,
});

/** New bill: the dates, and how many checked rows it takes. */
export const NewBill: Story = {
  beforeEach: creating.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New bill" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Client Bill" }),
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
      expect(posted(creating.holder.current, CLIENT_BILLS_API)).toMatchObject({
        projectId: PROJECT,
        billDate: "2026-10-22",
        measuredUpTo: "2026-10-15",
      }),
    );
  },
};

const editing = serveClientBills();

/** The client contract terms: edited in a dialog and saved with the stamp. */
export const EditTerms: Story = {
  beforeEach: editing.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit terms" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Client contract terms" }),
    );
    const gst = dialog.getByLabelText("GST (%)");
    await userEvent.clear(gst);
    await userEvent.type(gst, "40");
    await userEvent.click(dialog.getByRole("button", { name: "Save terms" }));
    await expect(
      await dialog.findByText(
        "GST is a percentage from 0 to 28, with at most two decimals.",
      ),
    ).toBeVisible();
    await userEvent.clear(gst);
    await userEvent.type(gst, "12");
    await userEvent.type(dialog.getByLabelText("Handover date"), "2027-03-31");
    await userEvent.click(dialog.getByRole("button", { name: "Save terms" }));
    await waitFor(() =>
      expect(
        posted(editing.holder.current, `${CLIENT_BILLS_API}/contract/update`),
      ).toMatchObject({
        projectId: PROJECT,
        expectedUpdatedAt: CONTRACT.updatedAt,
        retentionPercent: "10",
        retentionCapPercent: "5",
        sacCode: "9954",
        gstRate: "12",
        dlpMonths: 12,
        handoverOn: "2027-03-31",
      }),
    );
  },
};

const quantitiesOnly = serveClientBills({
  page: pageOf(false),
  contract: {
    ...CONTRACT,
    boqValue: null,
    retentionReceivable: null,
    financial: false,
    canEdit: false,
  },
});

/** Without Financial: quantities and statuses only, no totals, no New bill. */
export const WithoutFinancial: Story = {
  args: { canCreate: false },
  beforeEach: quantitiesOnly.beforeEach,
  play: async ({ canvas }) => {
    await shown(canvas, "Client Bills");
    await expect(canvas.queryByRole("region", { name: "Totals" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "New bill" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Edit terms" }),
    ).toBeNull();
  },
};

const phone = serveClientBills();

/** At 375 px each bill is a card and nothing scrolls sideways. */
export const PhoneWidth: Story = {
  beforeEach: phone.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    const cards = within(await shown(canvas, "Client Bills"));
    await expect(
      cards.getByRole("link", { name: "RA/26-27/00002 · RA 2" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT}/client-bills/${BILL_APPROVED}`,
    );
    await canvas.findByRole("region", { name: "Client contract terms" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
