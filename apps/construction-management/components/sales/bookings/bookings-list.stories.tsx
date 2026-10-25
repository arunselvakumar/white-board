import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  BOOKINGS_API,
  HOLD_ID,
  mockBookingApi,
  PROJECT_ID,
  type BookingApiOptions,
} from "./booking-fixtures";
import { BookingsList } from "./bookings-list";

let api: ReturnType<typeof mockBookingApi>;
function bookingApi(options: BookingApiOptions = {}) {
  return () => {
    api = mockBookingApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${PROJECT_ID}/bookings/list`;

const meta = {
  title: "Sales/Bookings/List",
  component: BookingsList,
  args: { projectId: PROJECT_ID },
  beforeEach: bookingApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <BookingsList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BookingsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Cards at phone width: unit, customer, dates and the status word. */
export const List: Story = {
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Bookings" }));
    const rows = list.getAllByRole("listitem");
    await expect(rows).toHaveLength(4);
    const [hold, booked, expired, cancelled] = rows;
    if (hold == null || booked == null || expired == null || cancelled == null)
      throw new Error("four bookings");
    await expect(
      within(hold).getByRole("link", { name: "Tower A · 101" }),
    ).toHaveAttribute("href", `${BASE}/${HOLD_ID}`);
    await expect(within(hold).getByText("On Hold")).toBeVisible();
    await expect(within(booked).getByText("Booked")).toBeVisible();
    await expect(within(expired).getByText("Hold expired")).toBeVisible();
    await expect(within(cancelled).getByText("Cancelled")).toBeVisible();
    await expect(canvas.getByText("4 bookings")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "New booking" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** The tabs filter by status, Hold expired included. */
export const StatusTabs: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Bookings" });
    const status = within(canvas.getByRole("tablist", { name: "Status" }));
    await userEvent.click(status.getByRole("tab", { name: /^Hold expired/ }));
    await waitFor(async () => {
      await expect(
        api.calls.mock.calls.some(
          ([call]) =>
            call.path.startsWith(`${BOOKINGS_API}?`) &&
            call.path.includes("status=hold_expired"),
        ),
      ).toBe(true);
    });
    await expect(await canvas.findByText("1 booking")).toBeVisible();
  },
};

/** Search by the customer. */
export const Search: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Bookings" });
    await userEvent.type(canvas.getByLabelText("Search"), "ravi");
    await expect(await canvas.findByText("1 booking")).toBeVisible();
    const list = within(canvas.getByRole("list", { name: "Bookings" }));
    await expect(list.getByText("Ravi Kumar")).toBeVisible();
  },
};

/** No bookings yet: a way to the first one. */
export const Empty: Story = {
  beforeEach: bookingApi({ empty: true }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No bookings yet")).toBeVisible();
  },
};

/** Read only: no New booking. */
export const ReadOnly: Story = {
  beforeEach: bookingApi({ flags: ["read"] }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Bookings" });
    await expect(
      canvas.queryByRole("link", { name: "New booking" }),
    ).toBeNull();
  },
};
