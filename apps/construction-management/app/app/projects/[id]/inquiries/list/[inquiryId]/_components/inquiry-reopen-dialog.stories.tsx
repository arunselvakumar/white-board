import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import { InquiryReopenDialog } from "./inquiry-reopen-dialog";
import {
  CONVERTED_BOOKING_ID,
  DEEPAK_ID,
  INQUIRY_PROJECT_ID,
  INQUIRIES,
  mockInquiryApi,
  type InquiryApiOptions,
} from "./inquiry-fixtures";

const LOST = INQUIRIES.find((item) => item.id === DEEPAK_ID) ?? INQUIRIES[0];
if (LOST == null) throw new Error("fixtures");

function serve(options: InquiryApiOptions = {}) {
  return () => mockInquiryApi(options).restore;
}

const meta = {
  title: "Sales/Inquiries/Reopen dialog",
  component: InquiryReopenDialog,
  args: {
    projectId: INQUIRY_PROJECT_ID,
    inquiry: LOST,
    open: true,
    onOpenChange: fn(),
  },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <InquiryReopenDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InquiryReopenDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A Lost inquiry goes back to Open. */
export const Reopen: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("alertdialog", { name: "Reopen Deepak Raj?" }),
    );
    await expect(
      dialog.getByText(/goes back to Open at Site Visit/),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
  },
};

/** A Converted one with its booking still active: refused, with the booking. */
export const BookingActive: Story = {
  args: {
    inquiry: {
      ...LOST,
      status: "converted",
      convertedBookingId: CONVERTED_BOOKING_ID,
    },
  },
  beforeEach: serve({
    closeError: {
      status: 409,
      code: "INQUIRY_BOOKING_ACTIVE",
      message:
        "This Inquiry's booking is still On Hold or Booked. Cancel or delete the booking first, then reopen it.",
    },
  }),
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("alertdialog", { name: "Reopen Deepak Raj?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reopen" }));
    await expect(
      await dialog.findByText(/booking is still On Hold or Booked/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: "Open the booking" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${INQUIRY_PROJECT_ID}/bookings/list/${CONVERTED_BOOKING_ID}`,
    );
  },
};
