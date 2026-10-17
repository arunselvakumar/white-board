import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import { InquiryFollowUpDialog } from "./inquiry-follow-up-dialog";
import {
  INQUIRIES_API,
  INQUIRY_PROJECT_ID,
  LAKSHMI_ID,
  STAGE_IDS,
  inquiry,
  mockInquiryApi,
} from "./inquiry-fixtures";

let api: ReturnType<typeof mockInquiryApi>;

function posts(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "POST" &&
        call.path === `${INQUIRIES_API}/${LAKSHMI_ID}/follow-ups`,
    );
}

/** 14 Oct 2026, 15:00 on the device. */
const NOW = new Date(2026, 9, 14, 15, 0);

const meta = {
  title: "Sales/Inquiries/Follow-up dialog",
  component: InquiryFollowUpDialog,
  args: {
    projectId: INQUIRY_PROJECT_ID,
    inquiry: inquiry(),
    open: true,
    onOpenChange: fn(),
    now: NOW,
  },
  beforeEach: () => {
    api = mockInquiryApi();
    return api.restore;
  },
  render: (args) => (
    <StoryQueries>
      <InquiryFollowUpDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryFollowUpDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A call now, a stage move and the next follow-up. */
export const Save: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialogElement = await body.findByRole("dialog", {
      name: "Add follow-up",
    });
    const dialog = within(dialogElement);
    await expect(dialog.getByLabelText("Done on date")).toHaveValue(
      "2026-10-14",
    );
    await expect(dialog.getByLabelText("Done on time")).toHaveValue("15:00");
    await expect(
      dialog.getByRole("combobox", { name: "Activity" }),
    ).toHaveTextContent("Call");
    await userEvent.type(
      dialog.getByLabelText("Remarks"),
      "Liked the plan; bringing family on Sunday",
    );
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Move to stage" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Negotiation" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Next follow-up date"),
      "2026-10-18",
    );
    await userEvent.type(dialog.getByLabelText("Next follow-up time"), "10:00");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts()[0]?.body).toEqual({
      activity: "call",
      doneOnDate: "2026-10-14",
      doneOnTime: "15:00",
      remarks: "Liked the plan; bringing family on Sunday",
      toStageId: STAGE_IDS.negotiation,
      nextFollowUpDate: "2026-10-18",
      nextFollowUpTime: "10:00",
    });
  },
};

/** The next follow-up cannot be before Done on; a server refusal shows on its field. */
export const Refusals: Story = {
  beforeEach: () => {
    api = mockInquiryApi({
      extra: (call) =>
        call.method === "POST" && call.path.endsWith("/follow-ups")
          ? Response.json(
              {
                code: "FOLLOW_UP_IN_FUTURE",
                message: "Done on cannot be in the future.",
                details: { field: "doneOn" },
              },
              { status: 400 },
            )
          : undefined,
    });
    return api.restore;
  },
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Add follow-up" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Next follow-up date"),
      "2026-10-01",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("The next follow-up must be after Done on."),
    ).toBeVisible();
    await userEvent.clear(dialog.getByLabelText("Next follow-up date"));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Done on cannot be in the future."),
    ).toBeVisible();
  },
};
