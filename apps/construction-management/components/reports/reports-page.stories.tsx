import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ReportJob, ReportKind } from "@/src/queries/reports";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import {
  catalogueHandler,
  CONTRACTOR_ID,
  DONE_DAILY_WORK,
  DONE_MUSTER,
  DONE_RENTED_USAGE,
  FAILED_PAYMENT,
  LIST_PATH,
  NEW_ATTENDANCE,
  PROJECT_EQUIPMENT,
  PROJECT_EQUIPMENT_PATH,
  PROJECT_ID,
  RUNNING_VENDOR,
  TODAY,
  WORKSHEET_OPTIONS,
  WORKSHEET_OPTIONS_PATH,
  job,
  LABOUR_AND_SITE_WORK_KINDS,
  PROJECT_CATALOGUE_PATH,
  FILTER_OPTIONS,
  MASON_ID,
  PROJECT_FILTER_OPTIONS_PATH,
  VENDOR_ID,
} from "./report-fixtures";
import {
  COUNTERPARTY_OPTIONS,
  financeLookupsHandler,
} from "../finance/account-fixtures";
import { ReportsPage } from "./reports-page";

const API = "/api/construction/reporting/reports";

let api: ReturnType<typeof mockApi>;

/** The finance cards a Transactions and Parties reporter gets. */
const FINANCE_KINDS: readonly ReportKind[] = [
  "transactions",
  "contractor_payments",
  "supplier_payments",
  "due_payments",
];

/** The tracking cards a Task and Issues reporter gets. */
const TRACKING_KINDS: readonly ReportKind[] = [
  "task_report",
  "issue_snag_report",
];

/**
 * The story's API with the Project's report catalogue in front: the
 * labour and site-work cards, plus `extra`.
 */
function withCatalogue(
  handler: (call: ApiCall) => Response | undefined,
  extra: readonly ReportKind[] = [],
): (call: ApiCall) => Response | undefined {
  const catalogue = catalogueHandler({
    project: [...LABOUR_AND_SITE_WORK_KINDS, ...extra],
  });
  return (call) => catalogue(call) ?? handler(call);
}

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

function list(items: ReportJob[]): Response {
  return Response.json({ items });
}

/**
 * Holds POSTs until `release()`, so a story can see the card's progress
 * state before the job comes back.
 */
function gatePosts(): { release: () => void; restore: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST") await gate;
    return inner(input, init);
  };
  return {
    release: () => {
      release();
    },
    restore: () => {
      globalThis.fetch = inner;
    },
  };
}

let gate: ReturnType<typeof gatePosts>;

const meta = {
  title: "Reports/Project reports",
  component: ReportsPage,
  args: { projectId: PROJECT_ID, today: TODAY },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-6xl p-4">
        <ReportsPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof ReportsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five report cards and the recent list with ready, failed and running reports. */
export const RecentStates: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH)
          return list([RUNNING_VENDOR, FAILED_PAYMENT, DONE_MUSTER]);
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    for (const name of [
      "All Labour Attendance",
      "All Labour Payment",
      "Month-wise Labour",
      "Vendor Attendance",
      "Muster roll and wage register",
    ])
      await expect(await canvas.findByRole("form", { name })).toBeVisible();
    // Range cards default to the month so far; month cards to this month.
    const attendance = within(
      canvas.getByRole("form", { name: "All Labour Attendance" }),
    );
    await expect(attendance.getByLabelText("From")).toHaveValue("2026-10-01");
    await expect(attendance.getByLabelText("To")).toHaveValue(TODAY);
    const muster = within(
      canvas.getByRole("form", { name: "Muster roll and wage register" }),
    );
    await expect(muster.getByLabelText("Month")).toHaveValue("2026-10");

    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    const items = recent.getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    const [running, failed, ready] = items.map((item) => within(item));
    await expect(running?.getByText("Generating")).toBeVisible();
    await expect(failed?.getByText("Failed")).toBeVisible();
    await expect(failed?.getByText(FAILED_PAYMENT.error ?? "")).toBeVisible();
    await expect(ready?.getByText("Ready")).toBeVisible();
    await expect(
      recent.getByRole("link", {
        name: "Muster roll and wage register September 2026 Excel",
      }),
    ).toHaveAttribute("href", `${API}/${DONE_MUSTER.id}/download?format=xlsx`);
    await expect(
      recent.getByRole("link", {
        name: "Muster roll and wage register September 2026 PDF",
      }),
    ).toHaveAttribute("href", `${API}/${DONE_MUSTER.id}/download?format=pdf`);
    // Only a ready report has downloads.
    await expect(recent.getAllByRole("link")).toHaveLength(2);
  },
};

/** No reports yet. */
export const Empty: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) =>
        call.method === "GET" && call.path === LIST_PATH ? list([]) : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No reports yet")).toBeVisible();
  },
};

/** Generate shows progress, then the downloads; the recent list refreshes. */
export const GenerateFlow: Story = {
  beforeEach: () => {
    let generated = false;
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH)
          return list(generated ? [NEW_ATTENDANCE] : []);
        if (call.method === "POST" && call.path === API) {
          generated = true;
          return Response.json(NEW_ATTENDANCE, { status: 201 });
        }
        return undefined;
      }),
    );
    gate = gatePosts();
    return () => {
      gate.restore();
      api.restore();
    };
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("No reports yet");
    const card = within(
      canvas.getByRole("form", { name: "All Labour Attendance" }),
    );
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await expect(
      await card.findByText("Generating the Excel and PDF…"),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Generating…" }),
    ).toBeDisabled();
    gate.release();

    await expect(await card.findByText("Ready to download")).toBeVisible();
    await expect(
      card.getByRole("link", { name: "All Labour Attendance Excel" }),
    ).toHaveAttribute(
      "href",
      `${API}/${NEW_ATTENDANCE.id}/download?format=xlsx`,
    );
    await expect(
      card.getByRole("link", { name: "All Labour Attendance PDF" }),
    ).toBeVisible();
    await expect(posted()[0]?.body).toEqual({
      kind: "labour_attendance",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY },
    });
    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getAllByRole("listitem")).toHaveLength(1);
  },
};

/** A month report sends the chosen month. */
export const MonthReport: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method === "POST" && call.path === API)
          return Response.json(DONE_MUSTER, { status: 201 });
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const card = within(
      await canvas.findByRole("form", {
        name: "Muster roll and wage register",
      }),
    );
    const month = card.getByLabelText("Month");
    await userEvent.clear(month);
    await userEvent.type(month, "2026-09");
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await expect(await card.findByText("Ready to download")).toBeVisible();
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "muster_roll",
      projectId: PROJECT_ID,
      params: { month: "2026-09" },
    });
  },
};

/** A job that fails shows its message; a refused request shows the server's words. */
export const FailedAndRefused: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method !== "POST") return undefined;
        const body = call.body as { kind: string };
        if (body.kind === "labour_attendance")
          return Response.json(FAILED_PAYMENT, { status: 201 });
        return Response.json(
          {
            code: "PERMISSION_DENIED",
            message:
              "This report is about amounts. Needs Labour Report and Financial. Ask the Owner to change your Permission Matrix.",
          },
          { status: 403 },
        );
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const attendance = within(
      await canvas.findByRole("form", { name: "All Labour Attendance" }),
    );
    await userEvent.click(attendance.getByRole("button", { name: "Generate" }));
    await expect(
      await attendance.findByText("The report failed"),
    ).toBeVisible();
    await expect(
      attendance.getByText(FAILED_PAYMENT.error ?? ""),
    ).toBeVisible();
    await expect(attendance.queryByRole("link")).toBeNull();

    const payment = within(
      canvas.getByRole("form", { name: "All Labour Payment" }),
    );
    await userEvent.click(payment.getByRole("button", { name: "Generate" }));
    await expect(await payment.findByText("Could not generate")).toBeVisible();
    await expect(
      payment.getByText(/This report is about amounts/),
    ).toBeVisible();
  },
};

/** A backwards period is caught before anything is sent. */
export const BackwardsPeriod: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) =>
        call.method === "GET" && call.path === LIST_PATH ? list([]) : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const card = within(
      await canvas.findByRole("form", { name: "Vendor Attendance" }),
    );
    const from = card.getByLabelText("From");
    await userEvent.clear(from);
    await userEvent.type(from, "2026-10-09");
    const to = card.getByLabelText("To");
    await userEvent.clear(to);
    await userEvent.type(to, "2026-10-02");
    await expect(
      await card.findByText(
        "The period must end on or after the day it starts.",
      ),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Generate" })).toBeDisabled();
    await expect(posted()).toHaveLength(0);
  },
};

/** The Site work group: five cards, the filters from the Project's Contractors and equipment. */
export const SiteWorkReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH)
          return list([DONE_RENTED_USAGE]);
        if (call.method === "GET" && call.path === WORKSHEET_OPTIONS_PATH)
          return Response.json(WORKSHEET_OPTIONS);
        if (call.method === "GET" && call.path === PROJECT_EQUIPMENT_PATH)
          return Response.json(PROJECT_EQUIPMENT);
        if (call.method === "POST" && call.path === API)
          return Response.json(DONE_DAILY_WORK, { status: 201 });
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const group = within(
      await canvas.findByRole("region", { name: "Site work" }),
    );
    for (const name of [
      "Daily Work",
      "Company Owned Equipment Usage",
      "Rented Equipment Usage",
      "Equipment Maintenance",
      "Equipment Transfers",
    ])
      await expect(group.getByRole("form", { name })).toBeVisible();
    await expect(
      group.getByText(
        "Needs Equipment Usage Report; hire cost needs Financial.",
      ),
    ).toBeVisible();
    // Maintenance and transfers have no filter.
    await expect(
      within(
        group.getByRole("form", { name: "Equipment Transfers" }),
      ).queryByRole("combobox"),
    ).toBeNull();

    const daily = within(group.getByRole("form", { name: "Daily Work" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await daily.findByRole("combobox", { name: "Contractor" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Velan Constructions" }),
    );
    await userEvent.click(daily.getByRole("button", { name: "Generate" }));
    await expect(await daily.findByText("Ready to download")).toBeVisible();
    await expect(posted()[0]?.body).toEqual({
      kind: "daily_work",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY, contractorId: CONTRACTOR_ID },
    });

    const owned = within(
      group.getByRole("form", { name: "Company Owned Equipment Usage" }),
    );
    await userEvent.click(
      await owned.findByRole("combobox", { name: "Equipment" }),
    );
    await expect(
      await body.findByRole("option", { name: "JCB 3DX (TN-09-AB-1234)" }),
    ).toBeVisible();
    await userEvent.click(body.getByRole("option", { name: "All equipment" }));

    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getByText("Rented Equipment Usage")).toBeVisible();
  },
};

/** Without Daily Worksheet or equipment read, the cards simply have no filter. */
export const SiteWorkWithoutFilters: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method === "POST" && call.path === API)
          return Response.json(DONE_RENTED_USAGE, { status: 201 });
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const group = within(
      await canvas.findByRole("region", { name: "Site work" }),
    );
    const rented = within(
      group.getByRole("form", { name: "Rented Equipment Usage" }),
    );
    await expect(rented.queryByRole("combobox")).toBeNull();
    await userEvent.click(rented.getByRole("button", { name: "Generate" }));
    await expect(await rented.findByText("Ready to download")).toBeVisible();
    await expect(posted()[0]?.body).toEqual({
      kind: "rented_equipment_usage",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY },
    });
  },
};

/**
 * Payments and accounts (CM-709): a card per finance report the viewer has
 * Report on (here Transactions and the party reports; no Petty Cash or
 * Other Expenses), with the Project's Contractors as a filter.
 */
export const FinanceReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method === "POST" && call.path === API)
          return Response.json(
            job({
              id: "0190a000-0000-7000-8000-0000000000f1",
              kind: (call.body as { kind: ReportJob["kind"] }).kind,
              title: "Due Payments",
              includesMoney: true,
            }),
            { status: 201 },
          );
        return financeLookupsHandler(call);
      }, FINANCE_KINDS),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const group = within(
      await canvas.findByRole("region", { name: "Payments and accounts" }),
    );
    for (const name of [
      "Transactions",
      "Contractor Payments",
      "Supplier Payments",
      "Due Payments",
    ])
      await expect(group.getByRole("form", { name })).toBeVisible();
    await expect(group.queryByRole("form", { name: "Petty Cash" })).toBeNull();
    await expect(
      group.queryByRole("form", { name: "Other Expenses" }),
    ).toBeNull();

    const due = within(group.getByRole("form", { name: "Due Payments" }));
    await expect(due.getByLabelText("As on")).toHaveValue(TODAY);
    await userEvent.click(due.getByRole("button", { name: "Generate" }));
    await expect(await due.findByText("Ready to download")).toBeVisible();
    await expect(posted()[0]?.body).toEqual({
      kind: "due_payments",
      projectId: PROJECT_ID,
      params: { asOn: TODAY },
    });

    const contractors = within(
      group.getByRole("form", { name: "Contractor Payments" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await contractors.findByRole("combobox", { name: "Contractor" }),
    );
    const contractor = COUNTERPARTY_OPTIONS["contractor"]?.[0];
    await userEvent.click(
      await body.findByRole("option", { name: contractor?.name ?? "" }),
    );
    await userEvent.click(
      contractors.getByRole("button", { name: "Generate" }),
    );
    await waitFor(() => expect(posted()).toHaveLength(2));
    await expect(posted()[1]?.body).toEqual({
      kind: "contractor_payments",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY, partyId: contractor?.id },
    });
  },
};

/** Without Report on any finance menu the group is not shown. */
export const NoFinanceReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("region", { name: "Site work" });
    await canvas.findByText("No reports yet");
    await expect(
      canvas.queryByRole("region", { name: "Payments and accounts" }),
    ).toBeNull();
  },
};

/**
 * Tasks, issues and inspections (CM-805): a card per tracking report the
 * viewer has Report on (here Task and Issue & Snag, not Inspection
 * Request), each generating for its period.
 */
export const TrackingReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method === "POST" && call.path === API)
          return Response.json(
            job({
              id: "0190a000-0000-7000-8000-0000000000f2",
              kind: (call.body as { kind: ReportJob["kind"] }).kind,
              title: "Task Report",
              includesMoney: true,
            }),
            { status: 201 },
          );
        return undefined;
      }, TRACKING_KINDS),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const group = within(
      await canvas.findByRole("region", {
        name: "Tasks, issues and inspections",
      }),
    );
    await expect(
      await group.findByRole("form", { name: "Task Report" }),
    ).toBeVisible();
    await expect(
      group.getByRole("form", { name: "Issue & Snag Report" }),
    ).toBeVisible();
    await expect(
      group.queryByRole("form", { name: "Inspection Request Report" }),
    ).toBeNull();
    const tasks = within(group.getByRole("form", { name: "Task Report" }));
    await userEvent.click(tasks.getByRole("button", { name: "Generate" }));
    await expect(await tasks.findByText("Ready to download")).toBeVisible();
    await expect(posted()[0]?.body).toEqual({
      kind: "task_report",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY },
    });
  },
};

/** Without Report on any tracking menu the group is not shown. */
export const NoTrackingReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("region", { name: "Site work" });
    await canvas.findByText("No reports yet");
    await expect(
      canvas.queryByRole("region", { name: "Tasks, issues and inspections" }),
    ).toBeNull();
  },
};

/**
 * The cards come from the server's catalogue (CM-901): a member with
 * Labour Report and no Financial gets only the reports they may request.
 */
export const TrimmedByTheCatalogue: Story = {
  beforeEach: () => {
    const catalogue = catalogueHandler({
      project: ["labour_attendance", "labour_month"],
    });
    api = mockApi(
      (call) =>
        catalogue(call) ??
        (call.method === "GET" && call.path === LIST_PATH
          ? list([])
          : undefined),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    const labour = within(
      await canvas.findByRole("region", { name: "Labour and vendor reports" }),
    );
    await expect(labour.getAllByRole("form")).toHaveLength(2);
    await expect(
      labour.getByRole("form", { name: "All Labour Attendance" }),
    ).toBeVisible();
    await expect(
      labour.getByRole("form", { name: "Month-wise Labour" }),
    ).toBeVisible();
    await expect(
      labour.queryByRole("form", { name: "All Labour Payment" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("region", { name: "Site work" }),
    ).toBeNull();
    await expect(
      api.calls.mock.calls.some(([call]) =>
        call.path.startsWith(PROJECT_CATALOGUE_PATH),
      ),
    ).toBe(true);
  },
};

/** A member with no Report flag on this Project: nothing to generate, no list. */
export const NothingToGenerate: Story = {
  beforeEach: () => {
    api = mockApi(catalogueHandler({ project: [] }));
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No reports you can generate here"),
    ).toBeVisible();
    await expect(canvas.queryByRole("form")).toBeNull();
    await expect(
      canvas.queryByRole("heading", { name: "Recent reports" }),
    ).toBeNull();
  },
};

/** While the catalogue loads, the page waits behind its fallback. */
export const Loading: Story = {
  beforeEach: () => {
    const inner = globalThis.fetch;
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    return () => {
      globalThis.fetch = inner;
    };
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Loading…")).toBeVisible();
    await expect(canvas.queryByRole("form")).toBeNull();
  },
};

/** On the queue a request comes back queued: the card says where it will appear. */
export const QueuedReport: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method === "POST" && call.path === API)
          return Response.json(
            job({
              id: "0190a000-0000-7000-8000-0000000000f3",
              status: "queued",
              startedAt: null,
              finishedAt: null,
            }),
            { status: 201 },
          );
        return undefined;
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const card = within(
      await canvas.findByRole("form", { name: "All Labour Attendance" }),
    );
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await expect(
      await card.findByText(/It appears under Recent reports and in Downloads/),
    ).toBeVisible();
    await expect(card.queryByRole("link")).toBeNull();
  },
};

/** A report past its 30 days says so and has no downloads. */
export const ExpiredReport: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) =>
        call.method === "GET" && call.path === LIST_PATH
          ? list([
              job({
                id: "0190a000-0000-7000-8000-0000000000f4",
                status: "expired",
                downloads: { xlsx: null, pdf: null },
              }),
            ])
          : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getByText("Expired")).toBeVisible();
    await expect(recent.getByText("Expired — generate it again")).toBeVisible();
    await expect(recent.queryByRole("link")).toBeNull();
  },
};

/** At phone width the cards stack and nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => {
    api = mockApi(
      withCatalogue(
        (call) =>
          call.method === "GET" && call.path === LIST_PATH
            ? list([RUNNING_VENDOR, FAILED_PAYMENT, DONE_MUSTER])
            : financeLookupsHandler(call),
        FINANCE_KINDS,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("region", { name: "Payments and accounts" });
    await canvas.findByRole("list", { name: "Recent reports" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** The pickers' choices on this Project, as the filter options route answers. */
function filterOptions(call: ApiCall): Response | undefined {
  if (call.method === "GET" && call.path === PROJECT_FILTER_OPTIONS_PATH)
    return Response.json({ ...FILTER_OPTIONS, projects: [], stores: [] });
  return undefined;
}

/** Vendor Attendance takes a Vendor and a Labour Category (CM-903). */
export const VendorPickers: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) => {
        if (call.method === "GET" && call.path === LIST_PATH) return list([]);
        if (call.method === "POST" && call.path === API)
          return Response.json(
            job({
              id: "0190a000-0000-7000-8000-0000000000bb",
              kind: "vendor_attendance",
              title: "Vendor Attendance",
            }),
            { status: 201 },
          );
        return filterOptions(call);
      }),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const card = within(
      await canvas.findByRole("form", { name: "Vendor Attendance" }),
    );
    await waitFor(() =>
      expect(card.getByRole("combobox", { name: "Vendor" })).toBeVisible(),
    );
    // A Project's report has no Projects filter.
    await expect(card.queryByLabelText("Projects")).toBeNull();
    await userEvent.click(card.getByRole("combobox", { name: "Vendor" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Ganesh Labour Supply" }),
    );
    await userEvent.click(
      card.getByRole("combobox", { name: "Labour Category" }),
    );
    await userEvent.click(await body.findByRole("option", { name: "Mason" }));
    await userEvent.click(card.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "vendor_attendance",
      projectId: PROJECT_ID,
      params: {
        from: "2026-10-01",
        to: TODAY,
        vendorId: VENDOR_ID,
        categoryId: MASON_ID,
      },
    });
  },
};

/** Without its choices (no read), the Vendor Attendance card has its period only. */
export const VendorPickersWithoutChoices: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue((call) =>
        call.method === "GET" && call.path === LIST_PATH ? list([]) : undefined,
      ),
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    const card = within(
      await canvas.findByRole("form", { name: "Vendor Attendance" }),
    );
    await expect(card.getByLabelText("From")).toBeVisible();
    await expect(card.queryByRole("combobox", { name: "Vendor" })).toBeNull();
  },
};

/** The Materials group: the five procurement cards and their pickers (CM-903). */
export const MaterialsReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue(
        (call) => {
          if (call.method === "GET" && call.path === LIST_PATH) return list([]);
          if (call.method === "POST" && call.path === API)
            return Response.json(
              job({
                id: "0190a000-0000-7000-8000-0000000000bc",
                kind: "purchase_requests",
                title: "Purchase Requests",
              }),
              { status: 201 },
            );
          return filterOptions(call);
        },
        [
          "purchase_requests",
          "purchase_orders",
          "material_received",
          "material_transfers",
          "stock_register",
        ],
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Materials" }),
    ).toBeVisible();
    for (const name of [
      "Purchase Requests",
      "Purchase Orders",
      "Material Received",
      "Material Transfers",
      "Stock Register",
    ])
      await expect(canvas.getByRole("form", { name })).toBeVisible();
    // A Project's Stock Register has no Store picker.
    const stock = within(canvas.getByRole("form", { name: "Stock Register" }));
    await waitFor(() =>
      expect(stock.getByRole("combobox", { name: "Material" })).toBeVisible(),
    );
    await expect(stock.queryByRole("combobox", { name: "Store" })).toBeNull();
    const transfers = within(
      canvas.getByRole("form", { name: "Material Transfers" }),
    );
    await userEvent.click(transfers.getByRole("combobox", { name: "Status" }));
    await expect(
      await body.findByRole("option", { name: "In transit" }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");

    const requests = within(
      canvas.getByRole("form", { name: "Purchase Requests" }),
    );
    await userEvent.click(
      requests.getByRole("combobox", { name: "Created By" }),
    );
    await userEvent.click(
      await body.findByRole("option", { name: "Prabhu Saravanan" }),
    );
    await userEvent.click(requests.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "purchase_requests",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY, createdBy: "user-1" },
    });
  },
};

/**
 * Contracts (CM-1111): BOQ vs Executed, the Work Order and RA bill
 * registers, deductions, retention, material reconciliation and
 * Variations. Registers take a period; the others are as on a day.
 */
export const ContractsReports: Story = {
  beforeEach: () => {
    api = mockApi(
      withCatalogue(
        (call) => {
          if (call.method === "GET" && call.path === LIST_PATH) return list([]);
          if (call.method === "POST" && call.path === API)
            return Response.json(
              job({
                id: "0190a000-0000-7000-8000-0000000000c1",
                kind: (call.body as { kind: ReportJob["kind"] }).kind,
                title: "Retention Register",
                includesMoney: true,
              }),
              { status: 201 },
            );
          return undefined;
        },
        [
          "boq_vs_executed",
          "work_order_register",
          "contractor_bill_register",
          "client_bill_register",
          "deductions_register",
          "retention_register",
          "material_reconciliation",
          "variations_register",
        ],
      ),
    );
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const group = within(
      await canvas.findByRole("region", { name: "Contracts" }),
    );
    for (const name of [
      "BOQ vs Executed",
      "Work Order Register",
      "RA Bill Register (Contractors)",
      "RA Bill Register (Client)",
      "Deductions Register",
      "Retention Register",
      "Material Reconciliation",
      "Variations Register",
    ])
      await expect(group.getByRole("form", { name })).toBeVisible();
    const retention = within(
      group.getByRole("form", { name: "Retention Register" }),
    );
    await userEvent.click(retention.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(1));
    await expect(posted()[0]?.body).toEqual({
      kind: "retention_register",
      projectId: PROJECT_ID,
      params: { asOn: TODAY },
    });
    const bills = within(
      group.getByRole("form", { name: "RA Bill Register (Client)" }),
    );
    await userEvent.click(bills.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(posted()).toHaveLength(2));
    await expect(posted()[1]?.body).toEqual({
      kind: "client_bill_register",
      projectId: PROJECT_ID,
      params: { from: "2026-10-01", to: TODAY },
    });
  },
};
