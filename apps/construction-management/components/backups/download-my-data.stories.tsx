import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { signInAs } from "../../.storybook/mocks/auth";
import { mockApi, StoryQueries, type ApiCall } from "../../.storybook/mocks/api";
import { BACKUP_ID, BACKUPS, backupResponse } from "./backup-fixtures";
import { DownloadMyDataAction } from "./download-my-data";

const EXPORT = backupResponse({
  scope: "my_data",
  title: "My data",
  detail: "Your profile, Companies and activity",
  projectId: null,
  projectName: null,
  modules: [],
  partsTotal: 1,
});

let calls: ApiCall[] = [];

function serve(post: () => Response) {
  calls = [];
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "POST" && call.path === BACKUPS) return post();
    if (call.method === "GET" && call.path === `${BACKUPS}/${BACKUP_ID}`)
      return Response.json({
        ...EXPORT,
        ...backupResponse({ status: "done" }),
        scope: "my_data",
        title: "My data",
        bytes: 18_300,
      });
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "Backups/DownloadMyData",
  component: DownloadMyDataAction,
  render: () => (
    <StoryQueries>
      <div role="list">
        <DownloadMyDataAction />
      </div>
    </StoryQueries>
  ),
  beforeEach() {
    signInAs("member");
  },
} satisfies Meta<typeof DownloadMyDataAction>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Prepare my data, then download the ZIP when it is ready. */
export const PrepareAndDownload: Story = {
  beforeEach: () => serve(() => Response.json(EXPORT, { status: 201 })),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Download my data…" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(dialog.getByText(/Aadhaar and PAN masked/)).toBeVisible();
    await userEvent.click(
      dialog.getByRole("button", { name: "Prepare my data" }),
    );
    await expect(
      await dialog.findByRole("link", { name: "Download ZIP" }, { timeout: 10_000 }),
    ).toBeVisible();
    await expect(dialog.getByText(/Your data is ready \(18 KB\)/)).toBeVisible();
    await expect(calls.find((call) => call.method === "POST")?.body).toEqual({
      scope: "my_data",
    });
  },
};

/** Too many unfinished exports: the refusal is shown. */
export const Refused: Story = {
  beforeEach: () =>
    serve(() =>
      Response.json(
        {
          code: "TOO_MANY_BACKUPS",
          message: "Wait for one of your backups to finish.",
        },
        { status: 409 },
      ),
    ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Download my data…" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Prepare my data" }),
    );
    await expect(
      await dialog.findByText("Wait for one of your backups to finish."),
    ).toBeVisible();
  },
};
