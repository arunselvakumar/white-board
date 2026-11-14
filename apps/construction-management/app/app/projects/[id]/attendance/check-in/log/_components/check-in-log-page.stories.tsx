import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  CHECK_INS_PATH,
  type CheckInEntry,
  type CheckInLogPage as LogPage,
} from "@/src/queries/check-ins";

import { mockApi, StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import {
  CONTEXT,
  MURUGAN_IN,
  PROJECT_ID,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-fixtures";
import {
  logPage,
  OLD_DAY,
  OLD_ENTRY,
  RAVI_IN,
  TODAY_ENTRIES,
} from "./check-in-log-fixtures";
import { CheckInLogPage } from "./check-in-log-page";
import { VOID_EXPLAINED, VOID_LABOUR_DAY } from "./void-entry-dialog";

let calls: ApiCall[] = [];

function reads(): URLSearchParams[] {
  return calls
    .filter(
      (call) =>
        call.method === "GET" && call.path.startsWith(`${CHECK_INS_PATH}?`),
    )
    .map((call) => new URLSearchParams(call.path.split("?")[1]));
}

/** Answers the log with `page(search)`, and Void with the entry struck out. */
function serve(page: (search: URLSearchParams) => LogPage = () => logPage()) {
  return () => {
    calls = [];
    let voided: CheckInEntry | null = null;
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path.startsWith(`${CHECK_INS_PATH}?`)) {
        const answer = page(new URLSearchParams(call.path.split("?")[1]));
        const struck = voided;
        return Response.json(
          struck == null
            ? answer
            : {
                ...answer,
                items: answer.items.map((item) =>
                  item.id === struck.id ? struck : item,
                ),
              },
        );
      }
      const match = /\/check-ins\/([^/]+)\/void$/.exec(call.path);
      if (call.method === "POST" && match != null) {
        const target = TODAY_ENTRIES.find((item) => item.id === match[1]);
        if (target == null) return undefined;
        const reason = (call.body as { reason: string }).reason;
        voided = {
          ...target,
          voided: {
            at: "2026-11-14T08:31:00.000Z",
            by: { id: "member-anugraha", name: "Anugraha Selvan" },
            reason,
          },
        };
        return Response.json({ entry: voided, person: null, day: null });
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Attendance/Check-In/Log",
  component: CheckInLogPage,
  args: { projectId: PROJECT_ID },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <CheckInLogPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof CheckInLogPage>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

function row(canvas: Canvas, name: string) {
  return within(canvas.getByRole("listitem", { name }));
}

/**
 * Today, newest first: photo, person, role, action, time, location with
 * Open in Maps, who recorded it; the voided entry is struck out with its
 * reason and cannot be voided again.
 */
export const Loaded: Story = {
  play: async ({ canvas }) => {
    const log = within(
      await canvas.findByRole("list", { name: "Check-In log" }),
    );
    await expect(
      log
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual([
      "Kavitha Murugan, Check Out 1:05 pm",
      "Murugan Ganesan, Check In 10:02 am",
      "Dhuresh Nawin, Check In 9:40 am",
      "Ravi Shankar, Check In 9:15 am",
      "Kavitha Murugan, Check In 9:00 am",
      "Raja Fabricators, Check In 9:00 am",
    ]);
    await expect(canvas.getByText("6 entries")).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Saturday, 14 Nov 2026" }),
    ).toBeVisible();
    const outside = row(canvas, "Kavitha Murugan, Check In 9:00 am");
    await expect(
      outside.getByText("240 m outside the site fence"),
    ).toBeVisible();
    const maps = outside.getByRole("link", { name: "Open in Maps" });
    await expect(maps).toHaveAttribute(
      "href",
      "https://www.google.com/maps?q=8.1833,77.4119",
    );
    await expect(maps).toHaveAttribute("target", "_blank");
    await expect(maps).toHaveAttribute("rel", "noreferrer");
    await expect(
      outside.getByText("Recorded by Anugraha Selvan"),
    ).toBeVisible();
    const vendor = row(canvas, "Raja Fabricators, Check In 9:00 am");
    await expect(vendor.getByText("No location")).toBeVisible();
    await expect(
      vendor.queryByRole("link", { name: "Open in Maps" }),
    ).toBeNull();
    const voided = row(canvas, "Dhuresh Nawin, Check In 9:40 am");
    await expect(
      voided.getByText(
        "Voided by Anugraha Selvan: Checked in the wrong person",
      ),
    ).toBeVisible();
    await expect(voided.getByText("Dhuresh Nawin")).toHaveClass("line-through");
    await expect(voided.queryByRole("button", { name: /^Void/ })).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Back to Check-In" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/attendance/check-in`,
    );
    await expect(
      canvas.getByRole("button", { name: "Next day" }),
    ).toBeDisabled();
  },
};

/** A thumbnail opens the photo large. */
export const PhotoOpensLarge: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Open the photo: Murugan Ganesan, Check In 10:02 am",
      }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Murugan Ganesan, Check In 10:02 am",
      }),
    );
    await expect(
      dialog.getByText("Inside the site fence · Recorded by Anugraha Selvan"),
    ).toBeVisible();
  },
};

/** The kind of person and the name filter the log, through the address. */
export const Filters: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Check-In log" });
    await userEvent.click(canvas.getByRole("tab", { name: "Site Engineers" }));
    await waitFor(() =>
      expect(reads().at(-1)?.get("kind")).toBe("site_engineer"),
    );
    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search by name" }),
      "ravi",
    );
    await waitFor(() => expect(reads().at(-1)?.get("q")).toBe("ravi"));
    await expect(reads().at(-1)?.get("projectId")).toBe(PROJECT_ID);
  },
};

/** Back a day: the date is asked for, and Next day comes back. */
export const PreviousDay: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Check-In log" });
    await userEvent.click(canvas.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(reads().at(-1)?.get("date")).toBe("2026-11-13"));
    await expect(canvas.getByLabelText("Date")).toHaveValue("2026-11-13");
    await expect(
      canvas.getByRole("button", { name: "Next day" }),
    ).toBeEnabled();
  },
};

/** A day with nobody checked in or out. */
export const EmptyDay: Story = {
  beforeEach: serve(() => logPage([])),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nobody was checked in or out on this day."),
    ).toBeVisible();
    await expect(canvas.getByText("0 entries")).toBeVisible();
  },
};

/** After 90 days the photo is gone; the entry, time and location stay. */
export const PhotoRemoved: Story = {
  parameters: { searchParams: `date=${OLD_DAY}` },
  beforeEach: serve(() => logPage([OLD_ENTRY], { date: OLD_DAY })),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Check-In log" });
    const entry = row(canvas, "Ravi Shankar, Check In 9:10 am");
    await expect(
      entry.getByRole("img", { name: "Photo removed" }),
    ).toBeVisible();
    await expect(entry.getByText("Photo removed")).toBeVisible();
    await expect(
      entry.queryByRole("button", { name: /^Open the photo/ }),
    ).toBeNull();
    await expect(reads().at(-1)?.get("date")).toBe(OLD_DAY);
    await expect(
      canvas.getByRole("heading", { name: "Saturday, 15 Aug 2026" }),
    ).toBeVisible();
  },
};

/**
 * Void asks for a reason (1 to 200 characters) and says what it does; the
 * entry is then struck out in the log.
 */
export const VoidDialogValidatesReason: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Void Murugan Ganesan, Check In 10:02 am",
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Void this entry" }),
    );
    await expect(
      dialog.getByText(
        `Murugan Ganesan · Check In 10:02 am. ${VOID_EXPLAINED} ${VOID_LABOUR_DAY}`,
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Void entry" }));
    await expect(await dialog.findByText("Give a reason")).toBeVisible();
    const reason = dialog.getByLabelText("Reason");
    await userEvent.click(reason);
    await userEvent.paste("x".repeat(201));
    await userEvent.click(dialog.getByRole("button", { name: "Void entry" }));
    await expect(
      await dialog.findByText("Use at most 200 characters"),
    ).toBeVisible();
    await userEvent.clear(reason);
    await userEvent.type(reason, "Checked in the wrong Murugan");
    await expect(dialog.getByText("28/200")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Void entry" }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.method === "POST").map((call) => call.body),
      ).toEqual([{ reason: "Checked in the wrong Murugan" }]),
    );
    await expect(
      await canvas.findByText("Voided Murugan Ganesan, Check In 10:02 am."),
    ).toBeVisible();
    await expect(
      await row(canvas, "Murugan Ganesan, Check In 10:02 am").findByText(
        "Voided by Anugraha Selvan: Checked in the wrong Murugan",
      ),
    ).toBeVisible();
  },
};

/** Without Attendance Delete there is no Void. */
export const NoVoid: Story = {
  beforeEach: serve(() => logPage(TODAY_ENTRIES, { canVoid: false })),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Check-In log" });
    await expect(canvas.queryByRole("button", { name: /^Void/ })).toBeNull();
  },
};

/** 50 at a time: Load more asks for the next page by its cursor. */
export const LoadMore: Story = {
  beforeEach: serve((search) =>
    search.get("after") === "page-2"
      ? logPage([RAVI_IN], { total: 2 })
      : logPage([MURUGAN_IN], { total: 2, nextCursor: "page-2" }),
  ),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Check-In log" });
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await expect(
      await canvas.findByRole("listitem", {
        name: "Ravi Shankar, Check In 9:15 am",
      }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
    await expect(reads().at(-1)?.get("after")).toBe("page-2");
  },
};

/** 375 px: rows stack, no sideways scroll. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Check-In log" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** The same in the dark theme. */
export const Dark: Story = {
  globals: { theme: "dark" },
  beforeEach: serve(() => logPage(TODAY_ENTRIES, { ...CONTEXT })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("list", { name: "Check-In log" }),
    ).toBeVisible();
  },
};
