import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries, type ApiCall } from "../../.storybook/mocks/api";
import {
  BACKUP_ID,
  BACKUPS,
  backupResponse,
  MASTER_MODULES,
  PROJECT_MODULES,
  TOWER,
} from "./backup-fixtures";
import { MastersBackupDialog, ProjectBackupDialog } from "./backup-dialog";

let calls: ApiCall[] = [];

function serve(input: {
  modules?: typeof PROJECT_MODULES;
  answer?: () => Response;
  reads?: () => Response;
}) {
  calls = [];
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "GET" && call.path.startsWith(`${BACKUPS}/options`))
      return Response.json({ modules: input.modules ?? PROJECT_MODULES });
    if (call.method === "POST" && call.path === BACKUPS)
      return (
        input.answer?.() ??
        Response.json(backupResponse(), { status: 201 })
      );
    if (call.method === "GET" && call.path === `${BACKUPS}/${BACKUP_ID}`)
      return input.reads?.() ?? Response.json(backupResponse({ status: "done" }));
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "Backups/BackupDialog",
  component: ProjectBackupDialog,
  args: { projectId: TOWER, projectName: "Tower A", onClose: () => undefined },
  render: (args) => (
    <StoryQueries>
      <ProjectBackupDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectBackupDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Pick a group and a module, a range and Media; Generate; it becomes ready. */
export const ProjectBackup: Story = {
  beforeEach: () => {
    let reads = 0;
    return serve({
      reads: () => {
        reads += 1;
        return Response.json(
          reads === 1
            ? backupResponse({ status: "running", partsDone: 1 })
            : backupResponse({ status: "done" }),
        );
      },
    });
  },
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await expect(await dialog.findByText("Back up Tower A")).toBeVisible();
    await userEvent.click(
      await dialog.findByRole("checkbox", { name: "Select all in Daily Work" }),
    );
    await expect(
      dialog.getByRole("checkbox", { name: "Daily Worksheets" }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: /Equipment Usage/ }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: "Select all modules" }),
    ).not.toBeChecked();
    await expect(dialog.getAllByText("Amounts")).toHaveLength(2);
    await userEvent.type(dialog.getByLabelText("From"), "2026-09-01");
    await userEvent.type(dialog.getByLabelText("To"), "2026-09-30");
    await userEvent.click(dialog.getByRole("checkbox", { name: /Media/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));

    await expect(
      await dialog.findByText(/Making your backup… 0 of 2 parts/),
    ).toBeVisible();
    await expect(
      calls.find((call) => call.method === "POST")?.body,
    ).toEqual({
      scope: "project",
      projectId: TOWER,
      modules: ["site_work.daily_worksheet", "site_work.equipment_usage"],
      from: "2026-09-01",
      to: "2026-09-30",
      includeData: true,
      includeMedia: true,
    });
    const download = await dialog.findByRole(
      "link",
      { name: "Download ZIP" },
      { timeout: 10_000 },
    );
    await expect(download).toHaveAttribute(
      "href",
      backupResponse({ status: "done" }).downloadHref ?? "",
    );
    await expect(dialog.getByText(/Your backup is ready \(1\.2 MB\)/)).toBeVisible();
    await expect(dialog.getByText(/The link works until 23 Oct 2026/)).toBeVisible();
  },
};

/** Select all ticks everything; no module, no content or a reversed range is refused. */
export const Validation: Story = {
  beforeEach: () => serve({}),
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await userEvent.click(
      await dialog.findByRole("button", { name: "Generate" }),
    );
    await expect(
      await dialog.findByText("Choose at least one module"),
    ).toBeVisible();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Select all modules" }),
    );
    for (const option of PROJECT_MODULES)
      await expect(
        dialog.getByRole("checkbox", { name: new RegExp(option.label) }),
      ).toBeChecked();
    await userEvent.click(dialog.getByRole("checkbox", { name: /^Data/ }));
    await userEvent.type(dialog.getByLabelText("From"), "2026-09-30");
    await userEvent.type(dialog.getByLabelText("To"), "2026-09-01");
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));
    await expect(
      await dialog.findByText("Choose Data, Media or both"),
    ).toBeVisible();
    await expect(dialog.getByText("To must be on or after From")).toBeVisible();
    await expect(calls.some((call) => call.method === "POST")).toBe(false);
  },
};

/** The server refuses a module the member may not view. */
export const Refused: Story = {
  beforeEach: () =>
    serve({
      answer: () =>
        Response.json(
          {
            code: "PERMISSION_DENIED",
            message:
              "You cannot back up Equipment Usage: it needs View on Equipment Usage. Ask the Owner to change your Permission Matrix.",
          },
          { status: 403 },
        ),
    }),
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await userEvent.click(
      await dialog.findByRole("checkbox", { name: /Equipment Usage/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));
    await expect(
      await dialog.findByText(/You cannot back up Equipment Usage/),
    ).toBeVisible();
  },
};

/** A member with View on nothing here is told so. */
export const NothingToBackUp: Story = {
  beforeEach: () => serve({ modules: [] }),
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await expect(
      await dialog.findByText(/You cannot back up anything here/),
    ).toBeVisible();
    await expect(dialog.queryByRole("button", { name: "Generate" })).toBeNull();
  },
};

/** A backup over the limit fails with the size message. */
export const TooLarge: Story = {
  beforeEach: () =>
    serve({
      reads: () =>
        Response.json(
          backupResponse({
            status: "failed",
            error: "Too large — choose fewer modules or a shorter range",
          }),
        ),
    }),
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await userEvent.click(
      await dialog.findByRole("checkbox", { name: "Select all modules" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));
    await expect(
      await dialog.findByText(
        "Too large — choose fewer modules or a shorter range",
        {},
        { timeout: 10_000 },
      ),
    ).toBeVisible();
    await expect(dialog.getByText("The backup could not be made.")).toBeVisible();
  },
};

/** Masters → Backup: the masters the member may view, no range or media. */
export const MastersBackup: Story = {
  render: () => (
    <StoryQueries>
      <MastersBackupDialog onClose={() => undefined} />
    </StoryQueries>
  ),
  beforeEach: () =>
    serve({
      modules: MASTER_MODULES,
      answer: () =>
        Response.json(
          backupResponse({
            scope: "masters",
            title: "Master records backup",
            projectId: null,
            projectName: null,
            status: "done",
          }),
          { status: 201 },
        ),
    }),
  play: async ({ canvasElement, userEvent }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog"));
    await expect(
      await dialog.findByText("Back up master records"),
    ).toBeVisible();
    await expect(dialog.queryByLabelText("From")).toBeNull();
    await expect(dialog.queryByRole("checkbox", { name: /Media/ })).toBeNull();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Contractors" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Generate" }));
    await expect(
      await dialog.findByRole("link", { name: "Download ZIP" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({
        scope: "masters",
        modules: ["masters.contractors"],
      }),
    );
  },
};

/** At phone width the dialog never scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => serve({}),
  play: async ({ canvasElement }) => {
    const dialog = await body(canvasElement).findByRole("dialog");
    await within(dialog).findByRole("checkbox", { name: "Select all modules" });
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
