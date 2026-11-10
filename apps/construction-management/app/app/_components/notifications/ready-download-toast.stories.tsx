import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { expect, fn, waitFor, within } from "storybook/test";

import { REPORTS_KEY } from "@/src/queries/reports";

import { StoryQueries } from "../../.storybook/mocks/api";
import { signInAs } from "../../.storybook/mocks/auth";

import {
  callsTo,
  mockNotificationApi,
  REPORT_READY,
  type NotificationApiOptions,
} from "./notification-fixtures";
import { MESSAGING_API } from "./notification-queries";
import { ReadyDownloadToast } from "./ready-download-toast";

const BASE = `${MESSAGING_API}/notifications`;
const SHOWN_KEY = "construction.notifications.ready-shown";
const download = fn<(href: string) => void>();

let api: ReturnType<typeof mockNotificationApi>;

function withApi(
  options: NotificationApiOptions = { latestReadyDownload: REPORT_READY },
  shown: string[] = [],
) {
  return () => {
    signInAs("member");
    download.mockClear();
    window.sessionStorage.setItem(SHOWN_KEY, JSON.stringify(shown));
    api = mockNotificationApi(options);
    return () => {
      api.restore();
      window.sessionStorage.removeItem(SHOWN_KEY);
    };
  };
}

/** A report list in the cache with one report still queued. */
function WithQueuedReport({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  useState(() =>
    client.setQueryData([...REPORTS_KEY, "central"], {
      items: [{ id: "r1", status: "queued" }],
    }),
  );
  return children;
}

const meta = {
  title: "Notifications/Ready toast",
  component: ReadyDownloadToast,
  args: { download },
  beforeEach: withApi(),
  render: (args) => (
    <StoryQueries>
      <ReadyDownloadToast {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ReadyDownloadToast>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** A ready report toasts with Download; Download starts it and marks it read. */
export const ReportReady: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = body(canvasElement);
    await expect(await page.findByText(REPORT_READY.title)).toBeVisible();
    await expect(page.getByText("1 Oct – 15 Oct 2026")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Download" }));
    await expect(download).toHaveBeenCalledWith(
      REPORT_READY.attachment?.downloads[0]?.href,
    );
    await waitFor(() =>
      expect(
        callsTo(api, "POST", `${BASE}/${REPORT_READY.id}/read`),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(page.queryByText(REPORT_READY.title)).toBeNull(),
    );
    await expect(
      JSON.parse(window.sessionStorage.getItem(SHOWN_KEY) ?? "[]"),
    ).toContain(REPORT_READY.id);
  },
};

/** A ready notification already toasted in this tab does not toast again. */
export const AlreadyShown: Story = {
  beforeEach: withApi({ latestReadyDownload: REPORT_READY }, [REPORT_READY.id]),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(callsTo(api, "GET", `${BASE}/unread-count`)).toHaveLength(1),
    );
    await expect(
      body(canvasElement).queryByText(REPORT_READY.title),
    ).toBeNull();
  },
};

/** Nothing ready: no toast. */
export const NothingReady: Story = {
  beforeEach: withApi({ latestReadyDownload: null }),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(callsTo(api, "GET", `${BASE}/unread-count`)).toHaveLength(1),
    );
    await expect(
      body(canvasElement).queryByRole("button", { name: "Download" }),
    ).toBeNull();
  },
};

/** While a report is queued the count is polled every 3 seconds. */
export const PollsFastWhileReportRuns: Story = {
  beforeEach: withApi({ latestReadyDownload: null }),
  render: (args) => (
    <StoryQueries>
      <WithQueuedReport>
        <ReadyDownloadToast {...args} />
      </WithQueuedReport>
    </StoryQueries>
  ),
  play: async () => {
    await waitFor(
      () =>
        expect(
          callsTo(api, "GET", `${BASE}/unread-count`).length,
        ).toBeGreaterThanOrEqual(2),
      { timeout: 8000 },
    );
  },
};
