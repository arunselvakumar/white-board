import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import { InquiryActivity } from "./inquiry-activity";
import {
  DEEPAK_ID,
  INQUIRY_PROJECT_ID,
  followUp,
  inquiry,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";

function api(options: InquiryApiOptions = {}) {
  return () => mockInquiryApi(options).restore;
}

const meta = {
  title: "Sales/Inquiries/Follow-ups and history",
  component: InquiryActivity,
  args: {
    projectId: INQUIRY_PROJECT_ID,
    inquiry: inquiry(),
    now: new Date(2026, 9, 14, 15, 0),
  },
  beforeEach: api(),
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-3xl p-4">
        <InquiryActivity {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Follow-ups merged with the history, newest first. */
export const Timeline: Story = {
  beforeEach: api({
    followUps: [
      followUp(),
      followUp({
        id: "0199c4a0-0000-7000-8000-000000580002",
        activity: "whatsapp",
        doneAt: "2026-10-12T09:00:00.000Z",
        doneOn: { date: "2026-10-12", time: "14:30" },
        remarks: "Sent the location pin.",
        fromStage: null,
        toStage: null,
        nextFollowUp: null,
        canDelete: false,
      }),
    ],
  }),
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", {
      name: "Follow-ups and history",
    });
    const items = within(list).getAllByRole("listitem");
    const call = items.find((item) => item.textContent.startsWith("Call"));
    const whatsapp = items.find((item) =>
      item.textContent.startsWith("WhatsApp"),
    );
    if (call == null || whatsapp == null) throw new Error("two follow-ups");
    await expect(call).toHaveTextContent("Moved from Contacted to Site Visit");
    // Newest first: the call of 13 Oct before the WhatsApp of 12 Oct.
    await expect(items.indexOf(call)).toBeLessThan(items.indexOf(whatsapp));
    await expect(whatsapp).toHaveTextContent("No next follow-up");
    await expect(
      within(whatsapp).queryByRole("button", { name: /Remove/ }),
    ).toBeNull();
    await expect(within(list).getByText("Added at New")).toBeVisible();
  },
};

/** Add follow-up opens the dialog; the new one tops the timeline. */
export const AddFollowUp: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Follow-ups and history" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add follow-up" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add follow-up" }),
    );
    await userEvent.type(dialog.getByLabelText("Remarks"), "Not picking up");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Add follow-up" })).toBeNull(),
    );
    await expect(await canvas.findByText("Not picking up")).toBeVisible();
  },
};

/** A closed inquiry takes no follow-ups. */
export const Closed: Story = {
  args: {
    inquiry: inquiry({
      id: DEEPAK_ID,
      status: "lost",
      actions: {
        edit: true,
        delete: true,
        followUp: false,
        manageTasks: true,
        close: false,
        convert: false,
        reopen: true,
      },
    }),
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Follow-ups and history" });
    await expect(
      canvas.queryByRole("button", { name: "Add follow-up" }),
    ).toBeNull();
  },
};
