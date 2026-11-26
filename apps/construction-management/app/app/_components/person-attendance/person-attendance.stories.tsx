import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";
import { labourAttendanceQuery } from "@/src/queries/person-attendance";

import { mockFetch } from "@/.storybook/mock-fetch";
import {
  LABOUR_ATTENDANCE,
  NO_ATTENDANCE,
  OFFICE_STAFF_ATTENDANCE,
  SITE_ENGINEER_ATTENDANCE,
  VENDOR_ATTENDANCE,
  attendancePage,
  attendanceRoute,
  type AttendanceFixture,
} from "./person-attendance-fixtures";
import { PersonAttendance } from "./person-attendance";

const ID = "0195f0a0-0000-7000-8000-00000000c0de";
const PATH = `/api/construction/labour/labours/${ID}/attendance`;
const EMPTY = "Days marked on the attendance sheet will show here.";

function serve(fixture: AttendanceFixture) {
  return () => mockFetch([attendanceRoute(PATH, fixture)]).restore;
}

const meta = {
  title: "People/Attendance tab",
  component: PersonAttendance,
  args: { query: labourAttendanceQuery(ID), emptyMessage: EMPTY },
  render: (args) => (
    <StoryQueryClient>
      <PersonAttendance {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof PersonAttendance>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A Labour: this month's cards, the all-time line and six months of calendar. */
export const Labour: Story = {
  beforeEach: serve(LABOUR_ATTENDANCE),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "November 2026" }),
    ).toBeVisible();
    const cards = canvas.getByRole("list", { name: "This month in figures" });
    for (const label of [
      "Days worked",
      "Hours worked",
      "Overtime",
      "Absent & leave",
      "Projects worked at",
    ])
      await expect(within(cards).getByText(label)).toBeVisible();
    await expect(canvas.getByText(/All time since Dec 2025:/)).toBeVisible();
    // Six months open: Jun to Nov 2026, with "Earlier" before them.
    await expect(
      canvas.getByRole("button", { name: /^Jun 2026/ }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Earlier" }),
    ).toBeInTheDocument();
  },
};

/** Hovering a day shows each Project and the hours there. */
export const HoverShowsProjectsAndHours: Story = {
  beforeEach: serve(LABOUR_ATTENDANCE),
  play: async ({ canvas, userEvent }) => {
    // 2026-11-02 is a Monday on two Projects in the fixture.
    const day = await canvas.findByRole("button", {
      name: /^Mon, 2 Nov 2026: Present, 10 h/,
    });
    await userEvent.hover(day);
    const tooltip = await waitFor(() => {
      const popup = document.querySelector<HTMLElement>(
        '[data-slot="tooltip-content"]',
      );
      if (popup == null) throw new Error("No tooltip yet");
      return popup;
    });
    await expect(tooltip).toHaveTextContent("Sky Towers");
    await expect(tooltip).toHaveTextContent("4 h 30 m");
    await expect(tooltip).toHaveTextContent("Villa Phase 2");
    await expect(tooltip).toHaveTextContent("5 h 30 m");
    await expect(tooltip).toHaveTextContent("Overtime 2 h");
    await expect(tooltip).toHaveTextContent("Total");
  },
};

/** Picking an earlier month loads the pages it needs and fills the cards. */
export const PickAnEarlierMonth: Story = {
  beforeEach: serve(LABOUR_ATTENDANCE),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "November 2026" });
    const previous = canvas.getByRole("button", { name: "Previous month" });
    for (let i = 0; i < 7; i += 1) await userEvent.click(previous);
    await expect(
      await canvas.findByRole("heading", { name: "April 2026" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.getByRole("button", { name: /^Apr 2026/, pressed: true }),
      ).toBeInTheDocument(),
    );
    await expect(
      canvas.getByRole("button", { name: "This month" }),
    ).toBeVisible();
  },
};

/** A Vendor: head-days instead of hours, and no absences. */
export const Vendor: Story = {
  beforeEach: serve(VENDOR_ATTENDANCE),
  play: async ({ canvas }) => {
    const cards = await canvas.findByRole("list", {
      name: "This month in figures",
    });
    await expect(within(cards).getByText("Head-days")).toBeVisible();
    await expect(within(cards).getByText("Days supplied")).toBeVisible();
    await expect(within(cards).queryByText("Absent & leave")).toBeNull();
    await expect(canvas.queryByText("Absent")).toBeNull();
  },
};

/**
 * A Site Engineer: days from the Check-In log, no absences, and a Check
 * In with no Check Out shown as such, adding no hours.
 */
export const SiteEngineer: Story = {
  beforeEach: serve(SITE_ENGINEER_ATTENDANCE),
  play: async ({ canvas }) => {
    const cards = await canvas.findByRole("list", {
      name: "This month in figures",
    });
    await expect(within(cards).getByText("Hours worked")).toBeVisible();
    await expect(within(cards).queryByText("Absent & leave")).toBeNull();
    // The log has no overtime and no half days, so neither is shown as a zero.
    await expect(within(cards).queryByText("Overtime")).toBeNull();
    await expect(within(cards).getByText("Days with a Check In")).toBeVisible();
    await expect(
      canvas.getByRole("button", {
        name: /^Tue, 17 Nov 2026: Present, 0 h\. Sky Towers, 0 h, 8:45 am – …, No check-out$/,
      }),
    ).toBeInTheDocument();
  },
};

/** Office Staff: HRMS days by branch, so the places card says Places. */
export const OfficeStaff: Story = {
  beforeEach: serve(OFFICE_STAFF_ATTENDANCE),
  play: async ({ canvas }) => {
    const cards = await canvas.findByRole("list", {
      name: "This month in figures",
    });
    await expect(within(cards).getByText("Places worked at")).toBeVisible();
    await expect(within(cards).getByText("Absent & leave")).toBeVisible();
  },
};

/** The calendar's scrolling strip. */
function strip(canvasElement: HTMLElement): HTMLElement {
  const calendar = within(canvasElement).getByRole("region", {
    name: "Attendance calendar",
  });
  const scroller = calendar.querySelector<HTMLElement>(".overflow-x-auto");
  if (scroller == null) throw new Error("No scrolling strip");
  return scroller;
}

/**
 * Scrolling back loads earlier months and leaves the view where the viewer
 * put it: the picked month (November) is not scrolled back into view.
 */
export const ScrollBackKeepsTheView: Story = {
  beforeEach: serve(LABOUR_ATTENDANCE),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("heading", { name: "November 2026" });
    const scroller = strip(canvasElement);
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event("scroll"));
    await expect(
      await canvas.findByRole("button", { name: /^Dec 2025/ }),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const november = scroller.querySelector<HTMLElement>(
      '[data-month="2026-11"]',
    );
    // November is still off to the right, not pulled back into view.
    await expect(november?.offsetLeft ?? 0).toBeGreaterThan(
      scroller.scrollLeft + scroller.clientWidth,
    );
  },
};

let earlierCalls = 0;

/**
 * A month picked further back than loaded, whose page fails: one request,
 * a message, and no retrying on its own ("Earlier" tries again).
 */
export const EarlierPageFails: Story = {
  parameters: { searchParams: "?month=2026-03" },
  beforeEach: () => {
    earlierCalls = 0;
    return mockFetch([
      {
        path: PATH,
        respond: ({ search }) => {
          if (search.get("to") == null)
            return Response.json(attendancePage(LABOUR_ATTENDANCE, null));
          earlierCalls += 1;
          return Response.json({ code: "X", message: "Down" }, { status: 500 });
        },
      },
    ]).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Couldn't load earlier months. Please try again.",
      ),
    ).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await expect(earlierCalls).toBe(1);
    await expect(canvas.getByRole("button", { name: "Earlier" })).toBeEnabled();
  },
};

export const Empty: Story = {
  beforeEach: serve(NO_ATTENDANCE),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No attendance yet")).toBeVisible();
    await expect(canvas.getByText(EMPTY)).toBeVisible();
  },
};

export const Failed: Story = {
  beforeEach: () =>
    mockFetch([
      {
        path: PATH,
        respond: () =>
          Response.json({ code: "X", message: "Down" }, { status: 500 }),
      },
    ]).restore,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Couldn't load the attendance"),
    ).toBeVisible();
  },
};

export const Dark: Story = {
  ...Labour,
  globals: { theme: "dark" },
};
