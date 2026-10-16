import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { DownloadItem } from "@/src/queries/downloads";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  BACKUP_EXPIRED,
  BACKUP_FAILED,
  BACKUP_READY,
  BACKUP_RUNNING,
  CENTRAL,
  DATA_EXPORT,
  DOWNLOADS_PATH,
  downloadRow,
  downloadsPage,
  DPR,
  EXPIRED,
  FAILED,
  FIRST_PAGE_PATH,
  GENERATING,
  READY,
} from "./download-fixtures";
import { DownloadsPage } from "./downloads-page";

let api: ReturnType<typeof mockApi>;

function posts(): string[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST")
    .map((call) => call.path);
}

/** Serves the first page from `items()` each time it is read. */
function serve(items: () => DownloadItem[]) {
  return () => {
    api = mockApi((call) =>
      call.method === "GET" && call.path === FIRST_PAGE_PATH
        ? Response.json(downloadsPage(items()))
        : undefined,
    );
    return api.restore;
  };
}

const meta = {
  title: "Reports/Downloads",
  component: DownloadsPage,
  parameters: {
    nextjs: { navigation: { pathname: "/app/downloads" } },
  },
  render: () => (
    <StoryQueries>
      <DownloadsPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof DownloadsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Ready, generating, failed, expired, a central report and a DPR. */
export const MixedStatuses: Story = {
  beforeEach: serve(() => [GENERATING, READY, FAILED, CENTRAL, DPR, EXPIRED]),
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Downloads" }));
    const rows = list.getAllByRole("listitem").map((row) => within(row));
    await expect(rows).toHaveLength(6);
    const [generating, ready, failed, central, dpr, expired] = rows;
    await expect(generating?.getByText("Generating")).toBeVisible();
    await expect(generating?.queryByRole("link")).toBeNull();
    await expect(ready?.getByText("Ready")).toBeVisible();
    await expect(
      ready?.getByText("Report · 01 Oct 2026 to 09 Oct 2026 · Tower A"),
    ).toBeVisible();
    await expect(ready?.getByText(/kept until 8 Nov 2026/)).toBeVisible();
    await expect(
      ready?.getByRole("link", {
        name: "All Labour Attendance 01 Oct 2026 to 09 Oct 2026 Excel",
      }),
    ).toHaveAttribute("href", READY.files[0]?.href ?? "");
    await expect(
      ready?.getByRole("link", {
        name: "All Labour Attendance 01 Oct 2026 to 09 Oct 2026 PDF",
      }),
    ).toBeVisible();
    await expect(failed?.getByText("Failed")).toBeVisible();
    await expect(failed?.getByText(FAILED.error ?? "")).toBeVisible();
    await expect(failed?.getByRole("button", { name: /^Retry/ })).toBeVisible();
    await expect(central?.getByText(/All projects/)).toBeVisible();
    await expect(dpr?.getAllByRole("link")).toHaveLength(1);
    // Progress Report delete is not this member's.
    await expect(dpr?.queryByRole("button", { name: /^Delete/ })).toBeNull();
    await expect(expired?.getByText("Expired")).toBeVisible();
    // Only failed reports retry.
    await expect(list.getAllByRole("button", { name: /^Retry/ })).toHaveLength(
      1,
    );
  },
};

/** No reports yet. */
export const Empty: Story = {
  beforeEach: serve(() => []),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Nothing to download yet"),
    ).toBeVisible();
    await expect(canvas.queryByRole("list")).toBeNull();
  },
};

/** While the first page loads. */
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
  },
};

/** An expired report says to generate it again and has no files. */
export const Expired: Story = {
  beforeEach: serve(() => [EXPIRED]),
  play: async ({ canvas }) => {
    const row = within(
      (await canvas.findAllByRole("listitem"))[0] ?? canvas.getByRole("list"),
    );
    await expect(row.getByText("Expired — generate it again")).toBeVisible();
    await expect(row.queryByRole("link")).toBeNull();
    await expect(row.queryByRole("button", { name: /^Retry/ })).toBeNull();
    await expect(row.getByRole("button", { name: /^Delete/ })).toBeVisible();
  },
};

/** Retry posts the row's link, and the list shows it generating again. */
export const FailedWithRetry: Story = {
  beforeEach: () => {
    let retried = false;
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === FIRST_PAGE_PATH)
        return Response.json(
          downloadsPage([
            retried
              ? downloadRow({
                  id: FAILED.id,
                  kind: "labour_payment",
                  title: FAILED.title,
                })
              : FAILED,
          ]),
        );
      if (call.method === "POST" && call.path === FAILED.retryHref) {
        retried = true;
        return Response.json({ id: FAILED.id, status: "queued" });
      }
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Retry All Labour Payment 01 Oct 2026 to 09 Oct 2026",
      }),
    );
    await waitFor(() => expect(posts()).toEqual([FAILED.retryHref]));
    await expect(await canvas.findByText("Ready")).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /^Retry/ })).toBeNull();
  },
};

/** A refused Retry shows the server's words. */
export const RetryRefused: Story = {
  beforeEach: () => {
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === FIRST_PAGE_PATH)
        return Response.json(downloadsPage([FAILED]));
      if (call.method === "POST")
        return Response.json(
          {
            code: "TOO_MANY_REPORTS",
            message: "Wait for one of your reports to finish.",
          },
          { status: 409 },
        );
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Retry/ }),
    );
    await expect(await canvas.findByText("Could not do that")).toBeVisible();
    await expect(
      canvas.getByText("Wait for one of your reports to finish."),
    ).toBeVisible();
  },
};

/** Delete asks first, then posts the row's link and the row goes. */
export const Delete: Story = {
  beforeEach: () => {
    let deleted = false;
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === FIRST_PAGE_PATH)
        return Response.json(downloadsPage(deleted ? [] : [READY]));
      if (call.method === "POST" && call.path === READY.deleteHref) {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: /^Delete All Labour/ }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("alertdialog"));
    await expect(
      dialog.getByText("Delete All Labour Attendance?"),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(posts()).toEqual([READY.deleteHref]));
    await expect(
      await canvas.findByText("Nothing to download yet"),
    ).toBeVisible();
  },
};

/** Show older reads the next page by its cursor. */
export const OlderPages: Story = {
  beforeEach: () => {
    api = mockApi((call) => {
      if (call.method !== "GET") return undefined;
      if (call.path === FIRST_PAGE_PATH)
        return Response.json(downloadsPage([READY], "page-2"));
      if (call.path === `${DOWNLOADS_PATH}?limit=20&cursor=page-2`)
        return Response.json(downloadsPage([EXPIRED]));
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Downloads" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Show older" }));
    await waitFor(() =>
      expect(within(list).getAllByRole("listitem")).toHaveLength(2),
    );
    await expect(
      canvas.queryByRole("button", { name: "Show older" }),
    ).toBeNull();
  },
};

/** While one is generating the list polls every 3 seconds until it is ready. */
export const PollsWhileGenerating: Story = {
  beforeEach: () => {
    let reads = 0;
    return serve(() => {
      reads += 1;
      return [
        reads === 1
          ? GENERATING
          : downloadRow({ ...GENERATING, status: "done" }),
      ];
    })();
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Generating")).toBeVisible();
    await waitFor(() => expect(canvas.getByText("Ready")).toBeVisible(), {
      timeout: 6_000,
    });
  },
};

/** At phone width nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: serve(() => [READY, FAILED, CENTRAL, DPR, EXPIRED]),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Downloads" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Backups and data exports (CM-906): status, the signed ZIP and Delete, never Retry. */
export const BackupRows: Story = {
  beforeEach: serve(() => [
    BACKUP_RUNNING,
    BACKUP_READY,
    DATA_EXPORT,
    BACKUP_FAILED,
    BACKUP_EXPIRED,
  ]),
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Downloads" }));
    const rows = list.getAllByRole("listitem").map((row) => within(row));
    await expect(rows).toHaveLength(5);
    const [running, ready, exported, failed, expired] = rows;
    await expect(running?.getByText("Generating")).toBeVisible();
    await expect(
      running?.getByText(
        "Backup · Every Project, master records and settings · All projects",
      ),
    ).toBeVisible();
    await expect(running?.queryByRole("link")).toBeNull();
    await expect(
      ready?.getByText(
        "Backup · 3 modules · 01 Sep 2026 to 30 Sep 2026 · Tower A",
      ),
    ).toBeVisible();
    await expect(
      ready?.getByRole("link", {
        name: "Project backup 3 modules · 01 Sep 2026 to 30 Sep 2026 ZIP",
      }),
    ).toHaveAttribute("href", BACKUP_READY.files[0]?.href ?? "");
    await expect(ready?.queryByRole("button", { name: /Retry/ })).toBeNull();
    await expect(
      exported?.getByText(
        "Data export · Your profile, Companies and activity · Your account",
      ),
    ).toBeVisible();
    await expect(
      exported?.getByRole("link", { name: /My data .* ZIP/ }),
    ).toBeVisible();
    await expect(
      failed?.getByText("Too large — choose fewer modules or a shorter range"),
    ).toBeVisible();
    await expect(failed?.getByText(/Master records$/)).toBeVisible();
    await expect(
      expired?.getByText("Expired — make a new backup"),
    ).toBeVisible();
    await expect(
      ready?.getByRole("button", { name: /^Delete Project backup/ }),
    ).toBeVisible();
  },
};
