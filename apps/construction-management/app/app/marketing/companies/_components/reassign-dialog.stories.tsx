import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  BALAJI_ID,
  MARKETING_COMPANIES_API,
  PRIYA_MEMBER_ID,
  company,
  mockCompanyApi,
  type CompanyApiOptions,
} from "./company-fixtures";
import { ReassignDialog } from "./reassign-dialog";

let api: ReturnType<typeof mockCompanyApi>;

const REASSIGN_PATH = `${MARKETING_COMPANIES_API}/${BALAJI_ID}/reassign`;

function reassigns(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === REASSIGN_PATH);
}

function serve(options: CompanyApiOptions = {}) {
  return () => {
    api = mockCompanyApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Marketing/Prospect Companies/Reassign dialog",
  component: ReassignDialog,
  args: { company: company(), open: true, onOpenChange: fn() },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <ReassignDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ReassignDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openDialog(canvasElement: HTMLElement) {
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Reassign Sri Balaji Infra Projects",
    }),
  );
}

/**
 * Only the other active Marketing People are offered; it says the open
 * Follow-ups move and past Visits stay with their visitors.
 */
export const People: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await openDialog(canvasElement);
    await expect(
      dialog.getByText(
        "Ravi Shankar is its Marketing Person. Its open Follow-ups move with it; past Visits keep their visitors.",
      ),
    ).toBeVisible();
    await userEvent.click(
      await dialog.findByRole("combobox", {
        name: "New Marketing Person",
      }),
    );
    await expect(await body.findAllByRole("option")).toHaveLength(2);
    await expect(
      body.getByRole("option", { name: "Arun Selva Kumar" }),
    ).toBeVisible();
    await expect(
      body.getByRole("option", { name: "Priya Raman" }),
    ).toBeVisible();
    // Ravi has it already; Mani has left.
    await expect(
      body.queryByRole("option", { name: "Ravi Shankar" }),
    ).toBeNull();
    await expect(
      body.queryByRole("option", { name: "Mani Kandan" }),
    ).toBeNull();
  },
};

/** Reassign needs a person, then sends who and the company's version. */
export const Reassigns: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await openDialog(canvasElement);
    await userEvent.click(
      await dialog.findByRole("button", { name: "Reassign" }),
    );
    await expect(
      await dialog.findByText("Choose who takes it over."),
    ).toBeVisible();
    await expect(reassigns()).toHaveLength(0);

    await userEvent.click(
      await dialog.findByRole("combobox", {
        name: "New Marketing Person",
      }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Priya Raman" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reassign" }));
    await waitFor(() => expect(reassigns()).toHaveLength(1));
    await expect(reassigns()[0]?.body).toEqual({
      assignedMemberId: PRIYA_MEMBER_ID,
      expectedUpdatedAt: "2026-11-12T10:35:00.000Z",
    });
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
  },
};

/** A stale company asks for a reload. */
export const Stale: Story = {
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path === REASSIGN_PATH
        ? Response.json(
            {
              code: "PROSPECT_COMPANY_CHANGED",
              message: "This Prospect Company changed.",
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await openDialog(canvasElement);
    await userEvent.click(
      await dialog.findByRole("combobox", {
        name: "New Marketing Person",
      }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Arun Selva Kumar" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reassign" }));
    await expect(
      await dialog.findByText(/Someone else changed this Prospect Company/),
    ).toBeVisible();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
