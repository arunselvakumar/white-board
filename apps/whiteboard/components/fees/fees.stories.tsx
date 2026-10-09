import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import { FeesScreen } from "@/components/fees/fees-screen";
import { QuerySuspense } from "@/components/query-suspense";
import { WorkspaceGate } from "@/components/workspace/workspace-gate";
import {
  feeDuesQueries,
  type FeeDueResponse,
  type FeeDuesFilter,
  type FeeDuesResponse,
  type FeeDuesSort,
  type FeeFollowUpDueResponse,
} from "@/src/queries/fee-dues";
import { getQueryClient } from "@/src/queries/query-client";
import { signInAs } from "../../.storybook/mocks/auth";

import { feeDateLabel } from "./fees-format";

/* ---------------------------- fixtures ---------------------------- */

const DCA = "770e8400-e29b-41d4-a716-446655440000";
const TALLY = "770e8400-e29b-41d4-a716-446655440001";
const DCA_MORNING = "660e8400-e29b-41d4-a716-446655440001";
const TALLY_WEEKEND = "660e8400-e29b-41d4-a716-446655440003";

function due(
  n: number,
  studentName: string,
  fields: Partial<FeeDueResponse>,
): FeeDueResponse {
  return {
    enrollmentId: `990e8400-e29b-41d4-a716-44665544000${n}`,
    studentId: `880e8400-e29b-41d4-a716-44665544000${n}`,
    studentName,
    courseId: DCA,
    courseName: "DCA",
    batchId: DCA_MORNING,
    batchName: "DCA Weekday 9–11 Offline",
    enrollmentEnded: false,
    remainingPaise: 0,
    overduePaise: 0,
    overdue: false,
    dueSoon: false,
    dueDatesClarity: "clear",
    oldestUnpaidDueOn: null,
    nextUnpaidDueOn: null,
    dueDates: [],
    openFollowUp: null,
    ...fields,
  };
}

/** Overdue and Due soon at once, with an open Fee Follow-up. */
const anita = due(1, "Anita Sharma", {
  remainingPaise: 600_000,
  overduePaise: 200_000,
  overdue: true,
  dueSoon: true,
  oldestUnpaidDueOn: "2026-09-10",
  nextUnpaidDueOn: "2026-09-10",
  dueDates: [
    { dueOn: "2026-09-10", amountPaise: 200_000 },
    { dueOn: "2026-10-10", amountPaise: 200_000 },
    { dueOn: "2026-11-10", amountPaise: 200_000 },
  ],
  openFollowUp: {
    id: "aa0e8400-e29b-41d4-a716-446655440001",
    channel: "phone",
    nextFollowUpOn: "2026-10-11",
  },
});

const rahul = due(2, "Rahul Verma", {
  remainingPaise: 300_000,
  dueSoon: true,
  nextUnpaidDueOn: "2026-10-11",
  dueDates: [{ dueOn: "2026-10-11", amountPaise: 300_000 }],
});

/** The due-date amounts don't add up to the Fee Plan. */
const priya = due(3, "Priya Nair", {
  courseId: TALLY,
  courseName: "Tally",
  batchId: TALLY_WEEKEND,
  batchName: "Tally Weekend",
  remainingPaise: 450_000,
  dueDatesClarity: "unclear",
  dueDates: [
    { dueOn: "2026-08-01", amountPaise: 300_000 },
    { dueOn: "2026-09-01", amountPaise: 300_000 },
  ],
});

/** Left the Batch, still owes. */
const imran = due(4, "Imran Khan", {
  enrollmentEnded: true,
  remainingPaise: 150_000,
  overduePaise: 150_000,
  overdue: true,
  oldestUnpaidDueOn: "2026-07-05",
  nextUnpaidDueOn: "2026-07-05",
  dueDates: [{ dueOn: "2026-07-05", amountPaise: 150_000 }],
});

const meena = due(5, "Meena Iyer", {
  remainingPaise: 250_000,
  nextUnpaidDueOn: "2026-11-01",
  dueDates: [{ dueOn: "2026-11-01", amountPaise: 250_000 }],
  openFollowUp: {
    id: "aa0e8400-e29b-41d4-a716-446655440005",
    channel: "in_person",
    nextFollowUpOn: null,
  },
});

const ALL_DUES = [anita, rahul, priya, imran, meena];

const followUpsDue: FeeFollowUpDueResponse[] = [
  {
    id: "bb0e8400-e29b-41d4-a716-446655440001",
    enrollmentId: imran.enrollmentId,
    studentId: imran.studentId,
    studentName: imran.studentName,
    courseName: imran.courseName,
    batchName: imran.batchName,
    remainingPaise: imran.remainingPaise,
    channel: "whatsapp_sms",
    note: "Father said he will send the balance after salary day. Asked him to bring the old receipt as well so we can match the September payment.",
    nextFollowUpOn: "2026-10-06",
    daysOverdue: 3,
  },
  {
    id: "bb0e8400-e29b-41d4-a716-446655440002",
    enrollmentId: rahul.enrollmentId,
    studentId: rahul.studentId,
    studentName: rahul.studentName,
    courseName: rahul.courseName,
    batchName: rahul.batchName,
    remainingPaise: rahul.remainingPaise,
    channel: "phone",
    note: "Will pay Saturday",
    nextFollowUpOn: "2026-10-09",
    daysOverdue: 0,
  },
];

function sortKey(item: FeeDueResponse): string | null {
  if (item.dueDatesClarity === "unclear") return null;
  return item.overdue ? item.oldestUnpaidDueOn : item.nextUnpaidDueOn;
}

/** What the API answers for a filter and sort over `items` (ADR-0039). */
function duesResponse(
  items: FeeDueResponse[],
  filter: FeeDuesFilter,
  sort: FeeDuesSort,
): FeeDuesResponse {
  const matching = items.filter((item) =>
    filter === "overdue"
      ? item.overdue
      : filter === "due_soon"
        ? item.dueSoon
        : true,
  );
  const sorted = [...matching].sort((a, b) => {
    if (sort === "amount") return b.remainingPaise - a.remainingPaise;
    const left = sortKey(a);
    const right = sortKey(b);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return left.localeCompare(right);
  });
  return {
    filter,
    sort,
    items: sorted,
    counts: {
      overdue: items.filter((item) => item.overdue).length,
      dueSoon: items.filter((item) => item.dueSoon).length,
      all: items.length,
    },
    totalRemainingPaise: items.reduce(
      (sum, item) => sum + item.remainingPaise,
      0,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* API mock: the first dues list is seeded; later filters are fetched */
/* ------------------------------------------------------------------ */

type DuesRequest = { filter: string | null; sort: string | null };

function mockFeeDues(
  items: FeeDueResponse[],
  followUps: FeeFollowUpDueResponse[],
  requests: DuesRequest[] = [],
) {
  const client = getQueryClient();
  client.removeQueries({ queryKey: feeDuesQueries.key.all });
  client.setQueryData(
    feeDuesQueries.list("all", "amount").queryKey,
    duesResponse(items, "all", "amount"),
  );
  client.setQueryData(feeDuesQueries.followUpsDue().queryKey, {
    items: followUps,
  });

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(href, window.location.origin);
    if (url.pathname !== "/api/training-institute/fee-dues") {
      return original(input, init);
    }
    const filter = url.searchParams.get("filter");
    const sort = url.searchParams.get("sort");
    requests.push({ filter, sort });
    // A short wait, so the stories show the last list while the next loads.
    await new Promise((resolve) => setTimeout(resolve, 150));
    return new Response(
      JSON.stringify(
        duesResponse(items, filter as FeeDuesFilter, sort as FeeDuesSort),
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return () => {
    globalThis.fetch = original;
    client.removeQueries({ queryKey: feeDuesQueries.key.all });
  };
}

/* ----------------------------- stories ----------------------------- */

const meta = {
  title: "Pages/Fees",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/fees" } },
  },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <QuerySuspense>
          <FeesScreen />
        </QuerySuspense>
      </AppShell>
    </WorkspaceGate>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function duesList(canvasElement: HTMLElement) {
  return within(
    within(canvasElement).getByRole("region", { name: "Dues list" }),
  );
}

function followUps(canvasElement: HTMLElement) {
  return within(
    within(canvasElement).getByRole("region", {
      name: /Follow-ups due today/,
    }),
  );
}

function rowNames(canvasElement: HTMLElement): string[] {
  return duesList(canvasElement)
    .getAllByRole("link", { name: /^Open Enrollment for / })
    .map((link) =>
      (link.getAttribute("aria-label") ?? "").replace(
        "Open Enrollment for ",
        "",
      ),
    );
}

export const DuesList: Story = {
  beforeEach: () => mockFeeDues(ALL_DUES, followUpsDue),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Fees" }),
    ).toBeVisible();

    const summary = within(canvas.getByRole("region", { name: "Fee summary" }));
    await expect(summary.getByText("₹17,500")).toBeVisible();

    const list = duesList(canvasElement);
    await expect(list.getByRole("tab", { name: /^Overdue 2/ })).toBeVisible();
    await expect(list.getByRole("tab", { name: /^Due soon 2/ })).toBeVisible();
    await expect(
      list.getByRole("tab", { name: /^All with a balance 5/ }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(list.getByLabelText("Sort by")).toHaveTextContent(
      "Amount owed",
    );

    // Largest amount owed first.
    await expect(rowNames(canvasElement)).toEqual([
      "Anita Sharma",
      "Priya Nair",
      "Rahul Verma",
      "Meena Iyer",
      "Imran Khan",
    ]);

    // Overdue: the oldest unpaid date and the overdue amount.
    await expect(
      list.getByText(`Overdue since ${feeDateLabel("2026-09-10")}`),
    ).toBeVisible();
    await expect(list.getByText("₹2,000 overdue")).toBeVisible();
    // Due soon: the next unpaid date, marked.
    await expect(
      list.getByText(`Next due ${feeDateLabel("2026-10-11")}`),
    ).toBeVisible();
    // Only Rahul is marked: Anita is Overdue, which shows her oldest date.
    await expect(
      within(list.getByRole("tabpanel")).getAllByText("Due soon"),
    ).toHaveLength(1);
    // Unclear: the plan's dates as a guide.
    await expect(
      list.getByText("Dates don’t match the Fee Plan"),
    ).toBeVisible();
    const planDates = within(
      list.getByRole("list", { name: "Fee Plan due dates" }),
    );
    await expect(
      planDates.getByText(`${feeDateLabel("2026-08-01")} · ₹3,000`),
    ).toBeVisible();
    // Ended Enrollments with money owed stay, tagged.
    await expect(list.getByText("Ended")).toBeVisible();
    // The open Fee Follow-up's next date.
    await expect(
      list.getByText(`Follow up ${feeDateLabel("2026-10-11")}`),
    ).toBeVisible();
    await expect(
      list.getByRole("link", { name: "Open Enrollment for Anita Sharma" }),
    ).toHaveAttribute("href", `/enrollments/${anita.enrollmentId}`);

    // Follow-ups due today, with the open Fee Follow-up's plan.
    const due = followUps(canvasElement);
    await expect(due.getByText("3 days overdue")).toBeVisible();
    await expect(due.getByText("Due today")).toBeVisible();
    await expect(due.getByText("WhatsApp/SMS")).toBeVisible();
    await expect(due.getByText(/Will pay Saturday/)).toBeVisible();
    await expect(
      due.getByRole("link", { name: "Rahul Verma" }),
    ).toHaveAttribute("href", `/enrollments/${rahul.enrollmentId}`);
  },
};

const switchRequests: DuesRequest[] = [];

export const SwitchFilterAndSort: Story = {
  beforeEach: () => {
    switchRequests.length = 0;
    return mockFeeDues(ALL_DUES, followUpsDue, switchRequests);
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Fees" });
    const list = duesList(canvasElement);

    await userEvent.click(list.getByRole("tab", { name: /^Overdue/ }));
    // The last list stays on screen while the next one loads.
    await expect(
      await list.findByText("Updating the dues list…"),
    ).toBeVisible();
    await expect(rowNames(canvasElement)).toHaveLength(5);
    await waitFor(() =>
      expect(rowNames(canvasElement)).toEqual(["Anita Sharma", "Imran Khan"]),
    );
    await expect(list.queryByText("Updating the dues list…")).toBeNull();

    await userEvent.click(list.getByLabelText("Sort by"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Due date",
      }),
    );
    await waitFor(() =>
      expect(rowNames(canvasElement)).toEqual(["Imran Khan", "Anita Sharma"]),
    );

    await userEvent.click(
      list.getByRole("tab", { name: /^All with a balance/ }),
    );
    // By due date; dates that don't match the Fee Plan sort last.
    await waitFor(() =>
      expect(rowNames(canvasElement)).toEqual([
        "Imran Khan",
        "Anita Sharma",
        "Rahul Verma",
        "Meena Iyer",
        "Priya Nair",
      ]),
    );
    await expect(switchRequests).toEqual([
      { filter: "overdue", sort: "amount" },
      { filter: "overdue", sort: "due_date" },
      { filter: "all", sort: "due_date" },
    ]);
  },
};

export const FollowUpsDueEmpty: Story = {
  beforeEach: () => mockFeeDues(ALL_DUES, []),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("heading", { name: "Fees" });
    await expect(
      followUps(canvasElement).getByText("No follow-ups due today."),
    ).toBeVisible();
    await expect(rowNames(canvasElement)).toHaveLength(5);
  },
};

export const OverdueEmpty: Story = {
  beforeEach: () => mockFeeDues([rahul, priya, meena], followUpsDue),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Fees" });
    const list = duesList(canvasElement);
    await userEvent.click(list.getByRole("tab", { name: /^Overdue 0/ }));
    await expect(await list.findByText("No overdue dues.")).toBeVisible();
  },
};

export const DueSoonEmpty: Story = {
  beforeEach: () => mockFeeDues([priya, imran, meena], followUpsDue),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { name: "Fees" });
    const list = duesList(canvasElement);
    await userEvent.click(list.getByRole("tab", { name: /^Due soon 0/ }));
    await expect(await list.findByText("Nothing due soon.")).toBeVisible();
  },
};

export const NothingOwed: Story = {
  beforeEach: () => mockFeeDues([], []),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("heading", { name: "Fees" });
    const list = duesList(canvasElement);
    await expect(list.getByText("No remaining dues.")).toBeVisible();
    await expect(
      list.getByText(
        "Remaining dues will show here after an Enrollment has a Fee Plan.",
      ),
    ).toBeVisible();
    await expect(
      list.getByRole("link", { name: "Open Students" }),
    ).toHaveAttribute("href", "/students");
    await expect(
      followUps(canvasElement).getByText("No follow-ups due today."),
    ).toBeVisible();
  },
};
