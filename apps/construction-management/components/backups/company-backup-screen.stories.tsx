import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { signInAs } from "../../.storybook/mocks/auth";
import { mockApi, StoryQueries, type ApiCall } from "../../.storybook/mocks/api";
import { BACKUP_ID, BACKUPS, backupResponse } from "./backup-fixtures";
import { CompanyBackupScreen } from "./company-backup-screen";

const CODES = "/api/construction/organization/action-codes";

const COMPANY = backupResponse({
  scope: "company",
  title: "Full Company backup",
  detail: "Every Project, master records and settings",
  projectId: null,
  projectName: null,
  includesMoney: true,
  partsTotal: 41,
});

let calls: ApiCall[] = [];

function serve(answer?: (body: unknown) => Response | undefined) {
  calls = [];
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "POST" && call.path === CODES)
      return new Response(null, { status: 204 });
    if (call.method === "POST" && call.path === BACKUPS)
      return (
        answer?.(call.body) ?? Response.json(COMPANY, { status: 201 })
      );
    if (call.method === "GET" && call.path === `${BACKUPS}/${BACKUP_ID}`)
      return Response.json({ ...COMPANY, status: "running", partsDone: 12 });
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "Backups/CompanyBackupScreen",
  component: CompanyBackupScreen,
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/settings/backup" } },
  },
  render: () => (
    <StoryQueries>
      <CompanyBackupScreen />
    </StoryQueries>
  ),
  beforeEach() {
    signInAs("owner");
  },
} satisfies Meta<typeof CompanyBackupScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Send the code, enter it, Generate: the backup is queued and followed. */
export const OwnerWithCode: Story = {
  beforeEach: () => serve(),
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Full Company backup" }),
    );
    await userEvent.click(form.getByRole("checkbox", { name: /Include media/ }));
    await userEvent.click(form.getByRole("button", { name: "Send code" }));
    await userEvent.type(await form.findByLabelText("6-digit code"), "482913");
    await userEvent.click(form.getByRole("button", { name: "Generate backup" }));
    await expect(
      await canvas.findByText(/Making your backup… 0 of 41 parts/),
    ).toBeVisible();
    await expect(calls.find((call) => call.path === CODES)?.body).toEqual({
      purpose: "company_backup",
    });
    await expect(
      calls.find((call) => call.method === "POST" && call.path === BACKUPS)
        ?.body,
    ).toEqual({ scope: "company", code: "482913", includeMedia: true });
  },
};

/** Generate without a code asks for it; a wrong code shows under the field. */
export const CodeRequiredAndWrong: Story = {
  beforeEach: () =>
    serve(() =>
      Response.json(
        {
          code: "ACTION_CODE_INVALID",
          message: "That code is not right. 4 tries left.",
          details: { attemptsLeft: 4 },
        },
        { status: 400 },
      ),
    ),
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Full Company backup" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Generate backup" }));
    await expect(await form.findByText("Enter the 6-digit code")).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Send code" }));
    await userEvent.type(await form.findByLabelText("6-digit code"), "111111");
    await userEvent.click(form.getByRole("button", { name: "Generate backup" }));
    await expect(
      await form.findByText("That code is not right. 4 tries left."),
    ).toBeVisible();
  },
};

/** A Team Member sees that it is the Owner's alone. */
export const MemberSeesOwnerOnly: Story = {
  beforeEach() {
    signInAs("member");
    return serve();
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Only the Owner can do this"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("form", { name: "Full Company backup" }),
    ).toBeNull();
  },
};

/** At phone width nothing scrolls sideways. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => serve(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("form", { name: "Full Company backup" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
