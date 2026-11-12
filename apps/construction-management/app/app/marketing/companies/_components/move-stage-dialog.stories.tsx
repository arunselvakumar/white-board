import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  BALAJI_ID,
  MARKETING_COMPANIES_API,
  company,
  mockCompanyApi,
  type CompanyApiOptions,
} from "./company-fixtures";
import { MoveStageDialog } from "./move-stage-dialog";

let api: ReturnType<typeof mockCompanyApi>;

const STAGE_PATH = `${MARKETING_COMPANIES_API}/${BALAJI_ID}/stage`;

function moves(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === STAGE_PATH);
}

function serve(options: CompanyApiOptions = {}) {
  return () => {
    api = mockCompanyApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Marketing/Prospect Companies/Move Stage dialog",
  component: MoveStageDialog,
  args: { company: company(), open: true, onOpenChange: fn() },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <MoveStageDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof MoveStageDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The current Stage can't be picked; New and Contacted are never offered. */
export const Stages: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Move Stage",
      }),
    );
    await expect(dialog.getAllByRole("radio")).toHaveLength(5);
    await expect(
      dialog.getByRole("radio", { name: "Quotation sent (now)" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.queryByRole("radio", { name: "New" })).toBeNull();
    await expect(dialog.queryByRole("radio", { name: "Contacted" })).toBeNull();
  },
};

/** Lost needs a Lost Reason, and Other needs the words. */
export const LostNeedsReason: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Move Stage" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await dialog.findByText("Choose a Stage.")).toBeVisible();

    await userEvent.click(dialog.getByRole("radio", { name: "Lost" }));
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(
      await dialog.findByText("Choose why the company was lost."),
    ).toBeVisible();

    await userEvent.click(
      dialog.getByRole("combobox", { name: "Lost Reason" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Other" }));
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(
      await dialog.findByText("Say why the company was lost."),
    ).toBeVisible();
    await expect(moves()).toHaveLength(0);

    await userEvent.type(
      dialog.getByLabelText("Why was it lost?"),
      "Budget moved to next year",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(moves()).toHaveLength(1));
    await expect(moves()[0]?.body).toEqual({
      stage: "lost",
      lostReason: "other",
      lostReasonText: "Budget moved to next year",
      expectedUpdatedAt: "2026-11-12T10:35:00.000Z",
    });
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
  },
};

/** A reason other than Other sends no words. */
export const LostForPrice: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Move Stage" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Lost" }));
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Lost Reason" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Price" }));
    await expect(dialog.queryByLabelText("Why was it lost?")).toBeNull();
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(moves()).toHaveLength(1));
    await expect(moves()[0]?.body).toMatchObject({
      stage: "lost",
      lostReason: "price",
      lostReasonText: null,
    });
  },
};

/** Someone moved it first: the dialog says to reload. */
export const Stale: Story = {
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path === STAGE_PATH
        ? Response.json(
            {
              code: "PROSPECT_COMPANY_CHANGED",
              message:
                "Someone else changed this Prospect Company. Reload it and try again.",
            },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ args, canvasElement, userEvent }) => {
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Move Stage",
      }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Won" }));
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(
      await dialog.findByText(/Reload the page to see their changes/),
    ).toBeVisible();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
