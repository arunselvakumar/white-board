import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  BOOKED_ID,
  BOOKINGS_API,
  bookingFile,
  CANCELLED_ID,
  HOLD_ID,
  mockBookingApi,
  PROJECT_ID,
  type BookingApiOptions,
} from "./booking-fixtures";
import { BookingDetail } from "./booking-detail";

let api: ReturnType<typeof mockBookingApi>;
function bookingApi(options: BookingApiOptions = {}) {
  return () => {
    api = mockBookingApi(options);
    return api.restore;
  };
}

function posts(path: string) {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

const meta = {
  title: "Sales/Bookings/Detail",
  component: BookingDetail,
  args: { projectId: PROJECT_ID, id: HOLD_ID, today: "2026-10-17" },
  beforeEach: bookingApi({
    files: [
      bookingFile("booking_form"),
      bookingFile("photo", { id: "0199c4a0-0000-7000-8000-00000000f102" }),
    ],
  }),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${PROJECT_ID}/bookings/list/${HOLD_ID}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <BookingDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BookingDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A hold with its facts, files, history and every action. */
export const OnHold: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Tower A · 101" }),
    ).toBeVisible();
    await expect(canvas.getByText("On Hold")).toBeVisible();
    for (const name of ["Confirm", "Extend hold", "Cancel booking", "Delete"])
      await expect(canvas.getByRole("button", { name })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(canvas.getByText("850 sq ft")).toBeVisible();
    await expect(
      await canvas.findByRole("link", { name: "booking-form.pdf" }),
    ).toBeVisible();
    const history = within(canvas.getByRole("list", { name: "History" }));
    await expect(
      history.getByText("Put on hold on 12 Oct 2026 until 24 Oct 2026"),
    ).toBeVisible();
  },
};

/** Cancel needs a reason and sends it with the date. */
export const Cancel: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Cancel booking" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Cancel booking" }),
    );
    await expect(
      await dialog.findByText("Say why the booking is cancelled."),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Loan refused");
    await userEvent.click(
      dialog.getByRole("button", { name: "Cancel booking" }),
    );
    await waitFor(async () => {
      await expect(posts(`${BOOKINGS_API}/${HOLD_ID}/cancel`)).toHaveLength(1);
    });
    await expect(
      posts(`${BOOKINGS_API}/${HOLD_ID}/cancel`)[0]?.body,
    ).toMatchObject({
      reason: "Loan refused",
      cancelledOn: "2026-10-17",
    });
  },
};

/** Confirm a hold on a date. */
export const Confirm: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Confirm" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(dialog.getByLabelText("Confirm date")).toHaveValue(
      "2026-10-17",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Confirm" }));
    await waitFor(async () => {
      await expect(
        posts(`${BOOKINGS_API}/${HOLD_ID}/confirm`)[0]?.body,
      ).toMatchObject({
        confirmedOn: "2026-10-17",
      });
    });
  },
};

/** A converted booking names its inquiry; no Confirm or Extend once booked. */
export const Booked: Story = {
  args: { id: BOOKED_ID },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Booked")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Ravi Kumar" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Confirm" })).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Cancel booking" }),
    ).toBeVisible();
  },
};

/** A cancelled booking keeps its reason; only Delete is left. */
export const Cancelled: Story = {
  args: { id: CANCELLED_ID },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Cancelled")).toBeVisible();
    await expect(canvas.getByText(/Loan refused/)).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Cancel booking" }),
    ).toBeNull();
  },
};

/** Read only: no actions, files listed without upload. */
export const ReadOnly: Story = {
  beforeEach: bookingApi({ flags: ["read"], files: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Tower A · 101" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Confirm" })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
    await expect(await canvas.findByText("None yet.")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add photos" }),
    ).toBeNull();
  },
};
