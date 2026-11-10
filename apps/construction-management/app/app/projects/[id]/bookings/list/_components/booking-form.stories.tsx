import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";

import {
  booking,
  BOOKINGS_API,
  mockBookingApi,
  PROJECT_ID,
  UNIT_101,
  type BookingApiOptions,
} from "./booking-fixtures";
import { BookingForm } from "./booking-form";

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
  title: "Sales/Bookings/Form",
  component: BookingForm,
  args: { projectId: PROJECT_ID },
  beforeEach: bookingApi(),
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/projects/${PROJECT_ID}/bookings/list/new` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <BookingForm {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BookingForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Opened from the unit panel's Book: the unit is chosen; Hold until hides. */
export const BookFromUnit: Story = {
  args: { unitId: UNIT_101, status: "booked" },
  play: async ({ canvas, userEvent }) => {
    await waitFor(async () => {
      await expect(canvas.getByLabelText("Unit")).toHaveTextContent(
        "101 · Floor 1",
      );
    });
    await expect(canvas.queryByLabelText("Hold until")).toBeNull();
    await userEvent.type(
      canvas.getByLabelText("Customer name"),
      "Meena Raghavan",
    );
    await userEvent.type(canvas.getByLabelText("Mobile"), "98765 43210");
    await userEvent.click(canvas.getByRole("button", { name: "Book unit" }));
    await waitFor(async () => {
      await expect(posts(BOOKINGS_API)).toHaveLength(1);
    });
    await expect(posts(BOOKINGS_API)[0]?.body).toMatchObject({
      projectId: PROJECT_ID,
      unitId: UNIT_101,
      status: "booked",
      customerName: "Meena Raghavan",
      customerMobile: "98765 43210",
      holdUntil: null,
    });
  },
};

/** A hold picks its Wing and unit, and may carry Hold until. */
export const Hold: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByLabelText("Wing"));
    await userEvent.click(await body.findByRole("option", { name: "Tower A" }));
    await userEvent.click(canvas.getByLabelText("Unit"));
    await userEvent.click(
      await body.findByRole("option", { name: "301 · Floor 3" }),
    );
    await expect(canvas.getByLabelText("Hold until")).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Customer name"), "Kavya S");
    await userEvent.click(canvas.getByRole("button", { name: "Hold unit" }));
    await waitFor(async () => {
      await expect(posts(BOOKINGS_API)[0]?.body).toMatchObject({
        status: "on_hold",
        unitId: "0199c4a0-0000-7000-8000-00000000c301",
      });
    });
  },
};

/** The unit and the customer's name are needed. */
export const Required: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Wing");
    await userEvent.click(canvas.getByRole("button", { name: "Hold unit" }));
    await expect(await canvas.findByText("Choose the unit.")).toBeVisible();
    await expect(canvas.getByText("Enter the customer's name.")).toBeVisible();
    await expect(posts(BOOKINGS_API)).toHaveLength(0);
  },
};

/** Someone booked the unit meanwhile: the server's words show at the unit. */
export const UnitBooked: Story = {
  args: { unitId: UNIT_101, status: "on_hold" },
  beforeEach: bookingApi({
    refuse: {
      status: 409,
      code: "UNIT_BOOKED",
      message: "This unit is already on hold or booked. Choose another unit.",
    },
  }),
  play: async ({ canvas, userEvent }) => {
    await waitFor(async () => {
      await expect(canvas.getByLabelText("Unit")).toHaveTextContent("101");
    });
    await userEvent.type(canvas.getByLabelText("Customer name"), "Meena");
    await userEvent.click(canvas.getByRole("button", { name: "Hold unit" }));
    await expect(
      await canvas.findByText(
        "This unit is already on hold or booked. Choose another unit.",
      ),
    ).toBeVisible();
  },
};

/** Edit keeps the unit and status; sends the `updatedAt` it loaded. */
export const Edit: Story = {
  args: { booking: booking() },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Tower A · 101")).toBeVisible();
    await expect(canvas.queryByLabelText("Wing")).toBeNull();
    const name = canvas.getByLabelText("Customer name");
    await userEvent.clear(name);
    await userEvent.type(name, "Meena R");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(
        posts(`${BOOKINGS_API}/${booking().id}/update`),
      ).toHaveLength(1);
    });
    await expect(
      posts(`${BOOKINGS_API}/${booking().id}/update`)[0]?.body,
    ).toMatchObject({
      customerName: "Meena R",
      expectedUpdatedAt: booking().updatedAt,
    });
  },
};
