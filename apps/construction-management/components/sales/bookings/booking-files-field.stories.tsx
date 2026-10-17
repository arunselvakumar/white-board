import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  BookingFilesField,
  NO_PENDING_BOOKING_FILES,
  type PendingBookingFiles,
} from "./booking-files-field";

function Harness() {
  const [value, setValue] = useState<PendingBookingFiles>(
    NO_PENDING_BOOKING_FILES,
  );
  return <BookingFilesField value={value} onChange={setValue} />;
}

const meta = {
  title: "Sales/Bookings/Files field",
  component: Harness,
  render: () => (
    <StoryQueries>
      <Harness />
    </StoryQueries>
  ),
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

const pdf = () =>
  new File(["%PDF-1.7"], "booking-form.pdf", { type: "application/pdf" });
const png = (name: string) => new File(["png"], name, { type: "image/png" });

/** One Booking Form and photos are held until the booking is saved. */
export const Picked: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      canvas.getByLabelText("Choose the Booking Form"),
      pdf(),
    );
    const form = within(
      canvas.getByRole("list", { name: "Booking Form to upload" }),
    );
    await expect(form.getByText("booking-form.pdf")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add Booking Form" }),
    ).toBeNull();
    await userEvent.upload(canvas.getByLabelText("Choose photos"), [
      png("site-1.png"),
      png("site-2.png"),
    ]);
    const photos = within(
      canvas.getByRole("list", { name: "Photos to upload" }),
    );
    await expect(photos.getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(
      photos.getByRole("button", { name: "Remove site-1.png" }),
    );
    await expect(photos.getAllByRole("listitem")).toHaveLength(1);
  },
};
