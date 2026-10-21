import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import {
  BOOKING_DASHBOARD_PATH,
  bookingDashboard,
  emptyBookingDashboard,
  emptyInquiryDashboard,
  INQUIRY_DASHBOARD_PATH,
  inquiryDashboard,
  noBookingDashboard,
} from "./sales-dashboard-fixtures";
import { BookingSection, InquirySection } from "./sales-sections";

const PROJECT_ID = "0199c4a0-0000-7000-8000-00000000a001";

function serve(answer: "data" | "empty" | "no_booking" | "forbidden") {
  return () =>
    mockApi(({ method, path }) => {
      if (method !== "GET" || !path.startsWith(BOOKING_DASHBOARD_PATH))
        return undefined;
      if (answer === "forbidden")
        return Response.json(
          { code: "PERMISSION_DENIED", message: "No." },
          { status: 403 },
        );
      return Response.json(
        answer === "empty"
          ? emptyBookingDashboard(PROJECT_ID)
          : answer === "no_booking"
            ? noBookingDashboard(PROJECT_ID)
            : bookingDashboard(PROJECT_ID),
      );
    }).restore;
}

const meta = {
  title: "Projects/Dashboard/Booking section",
  component: BookingSection,
  args: { projectId: PROJECT_ID },
  beforeEach: serve("data"),
  render: (args) => (
    <StoryQueries>
      <BookingSection {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BookingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Units by sales status for the Project and per Wing, and the latest bookings. */
export const Data: Story = {
  play: async ({ canvas }) => {
    const facts = within(await canvas.findByLabelText("Units by sales status"));
    await expect(facts.getByText("Available").parentElement).toHaveTextContent(
      "14",
    );
    await expect(facts.getByText("Booked").parentElement).toHaveTextContent(
      "9",
    );
    const wings = within(canvas.getByRole("list", { name: "Units by Wing" }));
    await expect(wings.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      wings.getByText("Available 6 · On Hold 2 · Booked 7 · Unavailable 1"),
    ).toBeVisible();
    const latest = within(
      canvas.getByRole("list", { name: "Latest bookings" }),
    );
    await expect(
      latest.getByRole("link", { name: "Tower A · 101" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/bookings/list/0199c4a0-0000-7000-8000-00000000d001`,
    );
    await expect(latest.getByText("Hold expired")).toBeVisible();
    await expect(
      canvas.getByText("As on today; the duration above does not apply."),
    ).toBeVisible();
  },
};

/** A Project without units yet. */
export const NoUnits: Story = {
  beforeEach: serve("empty"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No units yet: add Wings with their floors and units.",
      ),
    ).toBeVisible();
  },
};

/** Without Booking Read: the section says so. */
export const NoBookingPermission: Story = {
  beforeEach: serve("no_booking"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Bookings need the Booking permission on this Project.",
      ),
    ).toBeVisible();
  },
};

/** Without Dashboard Read. */
export const Forbidden: Story = {
  beforeEach: serve("forbidden"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Bookings need the Dashboard permission on this Project.",
      ),
    ).toBeVisible();
  },
};

// ---------------------------------------------------------------------------
// The Inquiry section (CM-1008)
// ---------------------------------------------------------------------------

const DURATION = {
  preset: "custom" as const,
  from: "2026-10-01",
  to: "2026-10-17",
};

let inquiryCalls: string[] = [];

function serveInquiry(answer: "data" | "empty" | "no_inquiry") {
  return () => {
    inquiryCalls = [];
    return mockApi(({ method, path }) => {
      if (method !== "GET" || !path.startsWith(INQUIRY_DASHBOARD_PATH))
        return undefined;
      inquiryCalls.push(path);
      const period = (new URL(path, "http://storybook.local").searchParams.get(
        "period",
      ) ?? "today") as "today";
      if (answer === "no_inquiry")
        return Response.json({ projectId: PROJECT_ID, inquiry: null });
      return Response.json(
        answer === "empty"
          ? emptyInquiryDashboard(PROJECT_ID)
          : inquiryDashboard(PROJECT_ID, period),
      );
    }).restore;
  };
}

/** The figures, the funnel, lead sources, the team and Call Activity. */
export const InquiryData: Story = {
  beforeEach: serveInquiry("data"),
  render: () => (
    <StoryQueries>
      <InquirySection projectId={PROJECT_ID} duration={DURATION} />
    </StoryQueries>
  ),
  play: async ({ canvas, userEvent }) => {
    const facts = within(await canvas.findByLabelText("Inquiry figures"));
    await expect(facts.getByText("Conv. Rate").parentElement).toHaveTextContent(
      "12.5%",
    );
    await expect(facts.getByText("Overdue").parentElement).toHaveTextContent(
      "7",
    );
    await expect(
      canvas.getByRole("figure", { name: "Funnel" }),
    ).toHaveTextContent("Site Visit");
    const sources = within(
      canvas.getByRole("list", { name: "Lead source performance" }),
    );
    await expect(sources.getByText("Walk-in")).toBeVisible();
    const team = within(
      canvas.getByRole("list", { name: "Sales team performance" }),
    );
    await expect(team.getByText("Karthik R")).toBeVisible();
    await expect(inquiryCalls[0]).toContain("from=2026-10-01");
    await expect(inquiryCalls[0]).toContain("period=today");
    const periods = within(
      canvas.getByRole("group", { name: "Call Activity period" }),
    );
    await userEvent.click(periods.getByRole("button", { name: "This Week" }));
    await waitFor(async () => {
      await expect(
        inquiryCalls.some((path) => path.includes("period=this_week")),
      ).toBe(true);
    });
    await expect(
      await canvas.findByText("Calls", {}, { timeout: 3000 }),
    ).toBeVisible();
    await waitFor(async () => {
      await expect(canvas.getByText("Calls").parentElement).toHaveTextContent(
        "14",
      );
    });
  },
};

/** No inquiries in the duration: no rate. */
export const InquiryEmpty: Story = {
  beforeEach: serveInquiry("empty"),
  render: () => (
    <StoryQueries>
      <InquirySection projectId={PROJECT_ID} duration={DURATION} />
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    const facts = within(await canvas.findByLabelText("Inquiry figures"));
    await expect(facts.getByText("Conv. Rate").parentElement).toHaveTextContent(
      "—",
    );
    await expect(canvas.getByText("No open inquiries.")).toBeVisible();
  },
};

/** Without Inquiry Read. */
export const InquiryNoPermission: Story = {
  beforeEach: serveInquiry("no_inquiry"),
  render: () => (
    <StoryQueries>
      <InquirySection projectId={PROJECT_ID} duration={DURATION} />
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Inquiries need the Inquiry permission on this Project.",
      ),
    ).toBeVisible();
  },
};
