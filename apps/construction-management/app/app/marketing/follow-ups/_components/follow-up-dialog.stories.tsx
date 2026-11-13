import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";

import {
  KAVERI_ID,
  OWNER_MEMBER_ID,
  RAVI_MEMBER_ID,
} from "../../companies/_components/company-fixtures";
import { FollowUpDialog } from "./follow-up-dialog";
import {
  MARKETING_FOLLOW_UPS_API,
  TODAY_CALL_ID,
  followUp,
  mockFollowUpApi,
  type FollowUpApiOptions,
} from "./follow-up-fixtures";

let api: ReturnType<typeof mockFollowUpApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function serve(options: FollowUpApiOptions = {}) {
  return () => {
    api = mockFollowUpApi(options);
    return api.restore;
  };
}

const ONE = `${MARKETING_FOLLOW_UPS_API}/${TODAY_CALL_ID}`;

const meta = {
  title: "Marketing/Follow-ups/Add and Edit",
  component: FollowUpDialog,
  args: { open: true, onOpenChange: fn() },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: "/app/marketing/follow-ups" } },
  },
  render: (args) => (
    <StoryQueries>
      <FollowUpDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof FollowUpDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function dialog(root: HTMLElement) {
  return within(root.ownerDocument.body);
}

/**
 * Add from the Follow-ups page: the company is picked, the type and the
 * due date are required, and the owner starts as the viewer.
 */
export const Add: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Add Follow-up" }),
    );
    await expect(form.getByLabelText("Owner")).toHaveTextContent(
      "Arun Selva Kumar",
    );
    await userEvent.click(form.getByRole("button", { name: "Add Follow-up" }));
    await expect(
      await form.findByText("Choose the Prospect Company."),
    ).toBeVisible();
    await expect(form.getByText("Choose the type.")).toBeVisible();
    await expect(form.getByText("Choose the date it is due.")).toBeVisible();

    await userEvent.type(
      form.getByRole("combobox", { name: "Prospect Company" }),
      "Kaveri",
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Kaveri Cement Works" }),
    );
    await userEvent.click(form.getByLabelText("Type"));
    await userEvent.click(
      await body.findByRole("option", { name: "Send quotation" }),
    );
    await userEvent.type(form.getByLabelText("Due date"), "2026-11-20");
    await userEvent.click(form.getByLabelText("Owner"));
    await userEvent.click(
      await body.findByRole("option", { name: "Ravi Shankar" }),
    );
    await userEvent.type(form.getByLabelText("Note"), "Cement silo rates");
    await userEvent.click(form.getByRole("button", { name: "Add Follow-up" }));

    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts(MARKETING_FOLLOW_UPS_API)[0]?.body).toEqual({
      prospectCompanyId: KAVERI_ID,
      visitId: null,
      type: "send_quotation",
      dueDate: "2026-11-20",
      ownerMemberId: RAVI_MEMBER_ID,
      note: "Cement silo rates",
    });
  },
};

/** From a Visit: its company and number are given, not picked. */
export const AddFromVisit: Story = {
  args: {
    prefill: {
      company: { id: KAVERI_ID, name: "Kaveri Cement Works" },
      visit: { id: "0199d000-0000-7000-8000-000000000502", number: "MV-0002" },
    },
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Add Follow-up" }),
    );
    await expect(
      form.getByText("Kaveri Cement Works", { exact: false }),
    ).toHaveTextContent("Kaveri Cement Works · from MV-0002");
    await expect(
      form.queryByRole("combobox", { name: "Prospect Company" }),
    ).toBeNull();
    await userEvent.click(form.getByLabelText("Type"));
    await userEvent.click(await body.findByRole("option", { name: "Call" }));
    await userEvent.type(form.getByLabelText("Due date"), "2026-11-13");
    await userEvent.click(form.getByRole("button", { name: "Add Follow-up" }));
    await waitFor(() =>
      expect(posts(MARKETING_FOLLOW_UPS_API)[0]?.body).toMatchObject({
        prospectCompanyId: KAVERI_ID,
        visitId: "0199d000-0000-7000-8000-000000000502",
        type: "call",
        ownerMemberId: OWNER_MEMBER_ID,
      }),
    );
  },
};

/** Edit shows the saved values and sends the version it opened. */
export const Edit: Story = {
  args: { followUp: followUp() },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Edit Follow-up" }),
    );
    await expect(form.getByLabelText("Type")).toHaveTextContent("Call");
    await expect(form.getByLabelText("Due date")).toHaveValue("2026-11-12");
    await expect(form.getByLabelText("Note")).toHaveValue(
      "Ask if the drawings reached them",
    );
    await userEvent.clear(form.getByLabelText("Due date"));
    await userEvent.type(form.getByLabelText("Due date"), "2026-11-15");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts(`${ONE}/update`)[0]?.body).toEqual({
      type: "call",
      dueDate: "2026-11-15",
      ownerMemberId: OWNER_MEMBER_ID,
      note: "Ask if the drawings reached them",
      expectedUpdatedAt: "2026-11-10T09:00:00.000Z",
    });
  },
};

/** Delete asks inside the dialog, then removes it. */
export const Delete: Story = {
  args: { followUp: followUp() },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Edit Follow-up" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Delete" }));
    const confirm = within(
      form.getByRole("group", { name: "Delete Follow-up" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts(`${ONE}/delete`)).toHaveLength(1);
  },
};

/** Someone else changed it: the dialog says to reload. */
export const Stale: Story = {
  args: { followUp: followUp() },
  beforeEach: serve({
    extra: (call) =>
      call.method === "POST" && call.path === `${ONE}/update`
        ? Response.json(
            { code: "FOLLOW_UP_CHANGED", message: "Changed." },
            { status: 409 },
          )
        : undefined,
  }),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = dialog(canvasElement);
    const form = within(
      await body.findByRole("form", { name: "Edit Follow-up" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(
        "Someone else changed this Follow-up after you opened it. Reload the page to see their changes, then try again.",
      ),
    ).toBeVisible();
    await expect(args.onOpenChange).not.toHaveBeenCalled();
  },
};
