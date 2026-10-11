import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";

import {
  FAILED,
  PROGRESS_PROJECT_ID,
  PROGRESS_TODAY,
  progressReportHandler,
  READY,
  RUNNING,
  type ProgressReportApiOptions,
} from "./progress-report-fixtures";
import { ProgressReportsPage } from "./progress-reports-page";

let api: ReturnType<typeof mockApi>;

function withApi(options: ProgressReportApiOptions = {}) {
  return () => {
    api = mockApi(progressReportHandler(options));
    return api.restore;
  };
}

function posted() {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

const meta = {
  title: "Site work/Progress Reports",
  component: ProgressReportsPage,
  args: { projectId: PROGRESS_PROJECT_ID },
  beforeEach: withApi(),
  render: (args) => (
    <StoryQueries>
      <ProgressReportsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProgressReportsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No reports yet: the empty state offers Create new. */
export const Empty: Story = {
  beforeEach: withApi({ reports: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Daily Progress Reports yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Create new" }),
    ).toHaveLength(2);
  },
};

/** Ready, preparing and failed reports with their actions. */
export const Reports: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Daily Progress Reports" }),
    );
    const items = list.getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    const [running, ready, failed] = items.map((item) => within(item));
    await expect(running?.getByText(RUNNING.number)).toBeVisible();
    await expect(running?.getByText("Preparing")).toBeVisible();
    await expect(
      running?.getByText(/Filled by Prabhu Saravanan/),
    ).toBeVisible();
    await expect(running?.queryByRole("button", { name: /Delete/ })).toBeNull();
    await expect(ready?.getByText("Ready")).toBeVisible();
    await expect(
      ready?.getByRole("link", {
        name: "Download DPR/26-27/00003 10 Oct 2026",
      }),
    ).toHaveAttribute("href", READY.download ?? "");
    await expect(failed?.getByText("Failed")).toBeVisible();
    await expect(failed?.getByText(FAILED.error ?? "")).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "Retry DPR/26-27/00002 9 Oct 2026" }),
    );
    await waitFor(async () => {
      await expect(posted().map((call) => call.path)).toContain(
        `/api/construction/site-work/progress-reports/${FAILED.id}/retry`,
      );
    });
    await waitFor(async () => {
      await expect(canvas.queryByText("Failed")).toBeNull();
    });

    await userEvent.click(
      canvas.getByRole("button", {
        name: "Delete DPR/26-27/00003 10 Oct 2026",
      }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("alertdialog"));
    await expect(dialog.getByText("Delete DPR/26-27/00003?")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(
        within(
          canvas.getByRole("list", { name: "Daily Progress Reports" }),
        ).getAllByRole("listitem"),
      ).toHaveLength(2);
    });
  },
};

/** Read only: no Create new, no Delete, no Retry. */
export const ReadOnly: Story = {
  beforeEach: withApi({
    reports: [READY, FAILED].map((report) => ({
      ...report,
      actions: { ...report.actions, retry: false, delete: false },
    })),
    flags: { "site_work.progress_reports": ["read"] },
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Daily Progress Reports" });
    await expect(
      canvas.queryByRole("button", { name: "Create new" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Delete/ })).toBeNull();
  },
};

/** Create new: the types, a future date refused, then a report generated. */
export const CreateDialog: Story = {
  beforeEach: withApi({ reports: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      (await canvas.findAllByRole("button", { name: "Create new" }))[0] ??
        canvas.getByRole("button", { name: "Create new" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    const date = await dialog.findByLabelText("Date");
    await expect(date).toHaveValue(PROGRESS_TODAY);

    await userEvent.click(dialog.getByLabelText("Report type"));
    const task = await body.findByRole("option", {
      name: /Task Progress Report/,
    });
    await expect(task).toHaveAttribute("aria-disabled", "true");
    await expect(task).toHaveTextContent("Coming with Tasks (M8)");
    await userEvent.keyboard("{Escape}");

    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-12");
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));
    await expect(
      await dialog.findByText("Choose today or an earlier date."),
    ).toBeVisible();
    await expect(posted()).toHaveLength(0);

    await userEvent.clear(date);
    await userEvent.type(date, "2026-10-08");
    await userEvent.click(dialog.getByLabelText("Report filled by"));
    await userEvent.click(
      await body.findByRole("option", { name: "Prabhu Saravanan" }),
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Include images in report/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));

    await waitFor(async () => {
      await expect(posted()[0]?.body).toEqual({
        projectId: PROGRESS_PROJECT_ID,
        date: "2026-10-08",
        filledBy: "user-engineer",
        includeImages: true,
      });
    });
    await expect(
      await canvas.findByRole("list", { name: "Daily Progress Reports" }),
    ).toBeVisible();
  },
};
