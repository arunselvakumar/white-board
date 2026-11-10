import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import { InquiryCloseDialog } from "./inquiry-close-dialog";
import {
  BOOKABLE_UNIT_IDS,
  INQUIRIES_API,
  INQUIRY_PROJECT_ID,
  INQUIRY_TODAY,
  LAKSHMI_ID,
  inquiry,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";

let api: ReturnType<typeof mockInquiryApi>;

function posts(action: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "POST" &&
        call.path === `${INQUIRIES_API}/${LAKSHMI_ID}/${action}`,
    );
}

function serve(options: InquiryApiOptions = {}) {
  return () => {
    api = mockInquiryApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Sales/Inquiries/Close dialog",
  component: InquiryCloseDialog,
  args: {
    projectId: INQUIRY_PROJECT_ID,
    inquiry: inquiry(),
    open: true,
    onOpenChange: fn(),
    today: INQUIRY_TODAY,
  },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <InquiryCloseDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryCloseDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Converted: a bookable unit grouped by Wing and the Booking Date. */
export const Converted: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Close Lakshmi Narayanan" }),
    );
    await expect(
      dialog.getByRole("radio", { name: "Converted" }),
    ).toBeChecked();
    await expect(dialog.getByLabelText("Booking Date")).toHaveValue(
      INQUIRY_TODAY,
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Book and close" }),
    );
    await expect(await dialog.findByText("Choose the unit.")).toBeVisible();
    await userEvent.click(
      await dialog.findByRole("combobox", { name: "Unit" }),
    );
    await expect(await body.findByText("B Wing")).toBeVisible();
    await userEvent.click(
      await body.findByRole("option", { name: /A Wing 102/ }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Book and close" }),
    );
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts("convert")[0]?.body).toEqual({
      unitId: BOOKABLE_UNIT_IDS.a102,
      bookingDate: INQUIRY_TODAY,
      expectedUpdatedAt: "2026-10-12T05:30:00.000Z",
    });
  },
};

/** Lost: a reason is needed; remarks are optional. */
export const Lost: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Close Lakshmi Narayanan" }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: "Lost" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Close as Lost" }),
    );
    await expect(
      await dialog.findByText("Choose why it was lost."),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("combobox", { name: "Lost Reason" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Budget" }));
    await userEvent.type(
      dialog.getByLabelText("Remarks"),
      "Wants under 40 lakhs",
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Close as Lost" }),
    );
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
    await expect(posts("lose")[0]?.body).toMatchObject({
      remarks: "Wants under 40 lakhs",
    });
  },
};

/** The unit was booked meanwhile: the reason shows under Unit. */
export const UnitTaken: Story = {
  beforeEach: serve({
    closeError: {
      status: 409,
      code: "UNIT_BOOKED",
      message: "This unit already has an active booking.",
    },
  }),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Close Lakshmi Narayanan" }),
    );
    await userEvent.click(
      await dialog.findByRole("combobox", { name: "Unit" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: /A Wing 101/ }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Book and close" }),
    );
    await expect(
      await dialog.findByText("This unit already has an active booking."),
    ).toBeVisible();
  },
};

/** Without Booking Create only Lost can be picked. */
export const LostOnly: Story = {
  args: {
    inquiry: inquiry({
      actions: {
        edit: true,
        delete: true,
        followUp: true,
        manageTasks: true,
        close: true,
        convert: false,
        reopen: false,
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Close Lakshmi Narayanan" }),
    );
    await expect(dialog.getByRole("radio", { name: "Lost" })).toBeChecked();
    await expect(
      dialog.getByRole("radio", { name: "Converted" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      dialog.getByText(/Converting needs Booking create/),
    ).toBeVisible();
  },
};
