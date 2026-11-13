import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import { mockGeolocation } from "@/.storybook/mocks/geolocation";

import { mockFollowUpApi } from "../../follow-ups/_components/follow-up-fixtures";
import { VisitDetail } from "./visit-detail";
import type { CheckLocation } from "./visit-check-in";
import {
  BALAJI_ID,
  CANCELLED_ID,
  CHECKED_IN_ID,
  COMPLETED_ID,
  MARKETING_VISITS_API,
  PLANNED_ID,
  TODAY_ID,
  cancelledVisit,
  checkedInVisit,
  mockVisitApi,
  todayVisit,
  visit,
  type VisitApiOptions,
} from "./visit-fixtures";

let api: ReturnType<typeof mockVisitApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function serve(options: VisitApiOptions = {}) {
  return () => {
    api = mockVisitApi(options);
    return api.restore;
  };
}

const BASE = "/app/marketing/visits";

const meta = {
  title: "Marketing/Visits/Visit page",
  component: VisitDetail,
  args: { id: COMPLETED_ID },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${COMPLETED_ID}` } },
  },
  render: (args) => (
    <StoryQueries>
      <VisitDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VisitDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A completed Visit: the company, the people met with their mobiles, the
 * requirement in Indian grouping, its notes and its history, newest first.
 * Adding a note puts it on top.
 */
export const CompletedWithNotesAndHistory: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "MV-0003" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Sri Balaji Infra Projects" }),
    ).toHaveAttribute("href", `/app/marketing/companies/${BALAJI_ID}`);
    await expect(canvas.getByText("10 Nov 2026, 1:30 pm")).toBeVisible();

    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(
      details.getByText("PEB · ₹ 2,50,00,000 · from Mar 2027"),
    ).toBeVisible();
    await expect(details.getByText("Ravi Shankar, Priya Raman")).toBeVisible();
    const contacts = within(
      details.getByRole("list", { name: "Points of contact" }),
    );
    await expect(contacts.getByText("+91 98450 12345")).toBeVisible();

    const history = within(canvas.getByRole("list", { name: "History" }));
    const entries = history.getAllByRole("listitem");
    await expect(entries).toHaveLength(4);
    await expect(entries[0]).toHaveTextContent("Note added · by Priya Raman");
    await expect(entries[1]).toHaveTextContent("Completed · by Ravi Shankar");
    await expect(entries[2]).toHaveTextContent(
      "Rescheduled from 8 Nov, 10:00 am to 10 Nov, 1:30 pm · by Ravi Shankar",
    );
    await expect(entries[3]).toHaveTextContent(
      "Planned · by Ravi Shankar · 5 Nov 2026, 10:00 am",
    );

    await userEvent.type(
      canvas.getByLabelText("Add note"),
      "Called Senthil: quotation next week.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add note" }));
    const notes = within(canvas.getByRole("list", { name: "Notes" }));
    await waitFor(() =>
      expect(notes.getAllByRole("listitem")[0]).toHaveTextContent(
        "Called Senthil: quotation next week.",
      ),
    );
    await expect(notes.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      posts(`${MARKETING_VISITS_API}/${COMPLETED_ID}/notes`)[0]?.body,
    ).toEqual({ text: "Called Senthil: quotation next week." });
    await expect(canvas.getByLabelText("Add note")).toHaveValue("");
  },
};

/** A planned Visit: Complete, and Edit, Reschedule, Cancel and Delete. */
export const PlannedWithActions: Story = {
  args: { id: PLANNED_ID },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("link", { name: "Complete" }),
    ).toHaveAttribute("href", `${BASE}/${PLANNED_ID}/complete`);
    await expect(canvas.getAllByText("Planned")[0]).toBeVisible();
    await expect(
      canvas.getByText("Written when the Visit is completed."),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Actions" }));
    await expect(
      await body.findByRole("menuitem", { name: "Edit" }),
    ).toHaveAttribute("href", `${BASE}/${PLANNED_ID}/edit`);
    await expect(
      body.getByRole("menuitem", { name: "Reschedule" }),
    ).toBeVisible();
    await expect(
      body.getByRole("menuitem", { name: "Cancel Visit" }),
    ).toBeVisible();
    await userEvent.click(body.getByRole("menuitem", { name: "Delete" }));
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete MV-0004?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(BASE));
    await expect(
      posts(`${MARKETING_VISITS_API}/${PLANNED_ID}/delete`)[0]?.body,
    ).toEqual({ expectedUpdatedAt: "2026-11-12T04:00:00.000Z" });
  },
};

/** Reschedule from the menu: the new time shows, the old one in History. */
export const Reschedule: Story = {
  args: { id: PLANNED_ID },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Reschedule" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Reschedule Visit" }),
    );
    await userEvent.clear(dialog.getByLabelText("New time"));
    await userEvent.type(dialog.getByLabelText("New time"), "15:00");
    await userEvent.click(dialog.getByRole("button", { name: "Reschedule" }));
    await expect(await canvas.findByText("14 Nov 2026, 3:00 pm")).toBeVisible();
    const history = within(canvas.getByRole("list", { name: "History" }));
    await expect(history.getAllByRole("listitem")[0]).toHaveTextContent(
      "Rescheduled from 14 Nov, 11:30 am to 14 Nov, 3:00 pm",
    );
  },
};

/** Past its 7 days: the page says it is locked; notes can still be added. */
export const Locked: Story = {
  beforeEach: serve({
    visits: [
      visit({
        actions: {
          canUpdate: false,
          canComplete: false,
          canCancel: false,
          canReschedule: false,
          canAddNote: true,
          canAddFiles: true,
          canCheckIn: false,
          canCheckOut: false,
          canDelete: false,
          locked: true,
        },
      }),
    ],
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole("note")).toHaveTextContent(
      "Locked: a completed Visit can be changed by the person who logged it for 7 days.",
    );
    await expect(canvas.queryByRole("button", { name: "Actions" })).toBeNull();
    await expect(canvas.getByLabelText("Add note")).toBeVisible();
  },
};

/**
 * Cancelled, on a colleague's company: the reason shows, the company name
 * is plain text, and only Delete is left.
 */
export const Cancelled: Story = {
  args: { id: CANCELLED_ID },
  beforeEach: serve({ visits: [cancelledVisit()] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("Cancelled")).toBeVisible();
    await expect(canvas.getByText("Coimbatore Textiles Ltd")).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Coimbatore Textiles Ltd" }),
    ).toBeNull();
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(
      details.getByText("Their MD is travelling this month"),
    ).toBeVisible();
    const history = within(canvas.getByRole("list", { name: "History" }));
    await expect(history.getAllByRole("listitem")[0]).toHaveTextContent(
      "Cancelled · Their MD is travelling this month · by Priya Raman",
    );
    await expect(canvas.queryByRole("link", { name: "Complete" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Actions" }));
    await expect(
      await body.findByRole("menuitem", { name: "Delete" }),
    ).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Edit" })).toBeNull();
  },
};

/**
 * With Follow-ups read, a card lists this Visit's Follow-ups with their
 * status or due; Add Follow-up has the Visit and its company filled in.
 */
export const WithFollowUps: Story = {
  args: { followUps: { create: true, logVisit: true } },
  beforeEach: () => {
    api = mockFollowUpApi();
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const card = within(
      await canvas.findByRole("region", { name: "Follow-ups" }),
    );
    const items = within(
      await card.findByRole("list", { name: "Follow-ups of this Visit" }),
    ).getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    const [done, today, upcoming] = items;
    if (done == null || today == null || upcoming == null)
      throw new Error("three Follow-ups");
    await expect(done).toHaveTextContent("Done 11 Nov 2026: Sent the rates");
    await expect(within(today).getByText("Due today")).toBeVisible();
    await expect(within(upcoming).getByText("Upcoming")).toBeVisible();

    await userEvent.click(card.getByRole("button", { name: "Add Follow-up" }));
    const body = within(canvasElement.ownerDocument.body);
    const form = within(
      await body.findByRole("form", { name: "Add Follow-up" }),
    );
    await expect(
      form.getByText("Sri Balaji Infra Projects", { exact: false }),
    ).toHaveTextContent("Sri Balaji Infra Projects · from MV-0003");
    await userEvent.click(form.getByLabelText("Type"));
    await userEvent.click(await body.findByRole("option", { name: "Email" }));
    await userEvent.type(form.getByLabelText("Due date"), "2026-11-18");
    await userEvent.click(form.getByRole("button", { name: "Add Follow-up" }));
    await waitFor(() =>
      expect(
        within(
          card.getByRole("list", { name: "Follow-ups of this Visit" }),
        ).getAllByRole("listitem"),
      ).toHaveLength(4),
    );
    await expect(
      posts("/api/construction/marketing/follow-ups")[0]?.body,
    ).toMatchObject({
      prospectCompanyId: BALAJI_ID,
      visitId: COMPLETED_ID,
      type: "email",
      dueDate: "2026-11-18",
    });
  },
};

/** A Visit's own API and a stand-in for the browser's position. */
function serveWithPosition(
  options: VisitApiOptions,
  result: Parameters<typeof mockGeolocation>[0],
) {
  return () => {
    const restoreApi = serve(options)();
    const restorePosition = mockGeolocation(result);
    return () => {
      restorePosition();
      restoreApi();
    };
  };
}

/**
 * Planned for today, to a visitor: Check in reads the position once and
 * sends it; the line, the map link and History follow, then Check out.
 */
export const CheckIn: Story = {
  args: { id: TODAY_ID },
  beforeEach: serveWithPosition(
    { visits: [todayVisit()] },
    { latitude: 13.0108, longitude: 80.2206, accuracy: 11.6 },
  ),
  play: async ({ canvas, userEvent }) => {
    const panel = within(
      await canvas.findByRole("region", { name: "Check in" }),
    );
    await userEvent.click(panel.getByRole("button", { name: "Check in" }));
    await expect(
      await canvas.findByText("Checked in at 12:01 pm, with your location."),
    ).toHaveAttribute("role", "status");
    await expect(
      posts(`${MARKETING_VISITS_API}/${TODAY_ID}/check-in`)[0]?.body,
    ).toEqual({
      position: { latitude: 13.0108, longitude: 80.2206, accuracy: 11.6 },
    });

    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("Check-in").nextSibling).toHaveTextContent(
      "Checked in at 12:01 pm by Arun Selva Kumar · within 12 m · Open in Maps",
    );
    await expect(
      details.getByRole("link", { name: "Open in Maps" }),
    ).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=13.0108,80.2206",
    );
    const history = within(canvas.getByRole("list", { name: "History" }));
    await expect(history.getAllByRole("listitem")[0]).toHaveTextContent(
      "Checked in · by Arun Selva Kumar",
    );
    await expect(
      canvas.getByRole("button", { name: "Check out" }),
    ).toBeVisible();
  },
};

/**
 * The browser refuses the position: the check-in is saved with the time,
 * sent as `refused`, and the page says the location was not shared.
 */
export const CheckInRefused: Story = {
  args: { id: TODAY_ID },
  beforeEach: serveWithPosition({ visits: [todayVisit()] }, { code: 1 }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Check in" }),
    );
    await expect(
      await canvas.findByText(
        /^Checked in at 12:01 pm with the time only: location was not shared\./,
      ),
    ).toHaveAttribute("role", "status");
    await expect(
      posts(`${MARKETING_VISITS_API}/${TODAY_ID}/check-in`)[0]?.body,
    ).toEqual({ location: "refused" });
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("Check-in").nextSibling).toHaveTextContent(
      "Checked in at 12:01 pm by Arun Selva Kumar · location not shared",
    );
    await expect(
      details.queryByRole("link", { name: "Open in Maps" }),
    ).toBeNull();
  },
};

/**
 * Checked in by Ravi: the time, the accuracy and a map link to open,
 * never a map on the page; Check out is the action left.
 */
export const CheckedInWithMapLink: Story = {
  args: { id: CHECKED_IN_ID },
  beforeEach: serve({ visits: [checkedInVisit()] }),
  play: async ({ canvas, canvasElement }) => {
    const details = within(
      await canvas.findByRole("region", { name: "Details" }),
    );
    await expect(details.getByText("Check-in").nextSibling).toHaveTextContent(
      "Checked in at 11:50 am by Ravi Shankar · within 12 m · Open in Maps",
    );
    const link = details.getByRole("link", { name: "Open in Maps" });
    await expect(link).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=10.7905,78.7047",
    );
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(canvasElement.querySelector("iframe")).toBeNull();
    await expect(canvas.queryByText("Check-out")).toBeNull();
    await expect(
      within(canvas.getByRole("region", { name: "Check out" })).getByRole(
        "button",
        { name: "Check out" },
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Check in" })).toBeNull();
  },
};

/** Answers the Check out story's position request when its play says so. */
let answerPosition: (value: CheckLocation) => void = () => undefined;

/**
 * Check out while the position is still being found, then the phone
 * cannot find one: sent as `unavailable`, saved with the time.
 */
export const CheckOut: Story = {
  args: {
    id: CHECKED_IN_ID,
    locate: () =>
      new Promise<CheckLocation>((resolve) => {
        answerPosition = resolve;
      }),
  },
  beforeEach: serve({ visits: [checkedInVisit()] }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Check out" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Finding your location…" }),
    ).toBeDisabled();
    answerPosition({ location: "unavailable" });
    await expect(
      await canvas.findByText(
        "Checked out at 12:01 pm with the time only: your phone could not find its location.",
      ),
    ).toHaveAttribute("role", "status");
    await expect(
      posts(`${MARKETING_VISITS_API}/${CHECKED_IN_ID}/check-out`)[0]?.body,
    ).toEqual({ location: "unavailable" });
    const details = within(canvas.getByRole("region", { name: "Details" }));
    await expect(details.getByText("Check-out").nextSibling).toHaveTextContent(
      "Checked out at 12:01 pm by Arun Selva Kumar · location unavailable",
    );
    await expect(
      canvas.queryByRole("region", { name: "Check out" }),
    ).toBeNull();
    await waitFor(() =>
      expect(
        within(canvas.getByRole("list", { name: "History" })).getAllByRole(
          "listitem",
        )[0],
      ).toHaveTextContent("Checked out · by Arun Selva Kumar"),
    );
  },
};
