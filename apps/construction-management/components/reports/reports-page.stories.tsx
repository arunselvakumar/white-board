import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ReportJob } from "@/src/queries/reports";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import {
  DONE_MUSTER,
  FAILED_PAYMENT,
  LIST_PATH,
  NEW_ATTENDANCE,
  PROJECT_ID,
  RUNNING_VENDOR,
  TIMED_OUT_MUSTER,
  TODAY,
} from "./report-fixtures";
import { ReportsPage } from "./reports-page";

const API = "/api/construction/reporting/reports";

let api: ReturnType<typeof mockApi>;

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
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === LIST_PATH)
        return list([RUNNING_VENDOR, FAILED_PAYMENT, DONE_MUSTER]);
      return undefined;
    });
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
      await expect(canvas.getByRole("form", { name })).toBeVisible();
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
    api = mockApi((call) =>
      call.method === "GET" && call.path === LIST_PATH ? list([]) : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No reports yet")).toBeVisible();
  },
};

/**
 * A report cut off by the time limit reads as failed: no spinner, no
 * downloads, and the reason, so the list stops polling.
 */
export const TimedOut: Story = {
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path === LIST_PATH
        ? list([TIMED_OUT_MUSTER])
        : undefined,
    );
    return api.restore;
  },
  play: async ({ canvas }) => {
    const recent = within(
      await canvas.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getByText("Failed")).toBeVisible();
    await expect(
      recent.getByText("The report took too long. Try a shorter period."),
    ).toBeVisible();
    await expect(recent.queryByText("Generating")).toBeNull();
    await expect(recent.queryAllByRole("link")).toHaveLength(0);
  },
};

/** Generate shows progress, then the downloads; the recent list refreshes. */
export const GenerateFlow: Story = {
  beforeEach: () => {
    let generated = false;
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === LIST_PATH)
        return list(generated ? [NEW_ATTENDANCE] : []);
      if (call.method === "POST" && call.path === API) {
        generated = true;
        return Response.json(NEW_ATTENDANCE, { status: 201 });
      }
      return undefined;
    });
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
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === LIST_PATH) return list([]);
      if (call.method === "POST" && call.path === API)
        return Response.json(DONE_MUSTER, { status: 201 });
      return undefined;
    });
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
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === LIST_PATH) return list([]);
      if (call.method !== "POST") return undefined;
      const body = call.body as { kind: string };
      if (body.kind === "labour_attendance")
        return Response.json(FAILED_PAYMENT, { status: 201 });
      return Response.json(
        {
          code: "PERMISSION_DENIED",
          message:
            "This report is about amounts: it needs Financial on Labour. Ask the Owner to change your Permission Matrix.",
        },
        { status: 403 },
      );
    });
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
      payment.getByText(/it needs Financial on Labour/),
    ).toBeVisible();
  },
};

/** A backwards period is caught before anything is sent. */
export const BackwardsPeriod: Story = {
  beforeEach: () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path === LIST_PATH ? list([]) : undefined,
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
