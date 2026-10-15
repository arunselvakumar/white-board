import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  DELAYED_ID,
  ISSUE_PROJECT_ID,
  ISSUES_API,
  mockIssueApi,
  PENDING_ID,
  SOLVED_ID,
  type IssueApiOptions,
} from "./issue-fixtures";
import { IssuesList } from "./issues-list";

let api: ReturnType<typeof mockIssueApi>;

function calls(method: string, prefix: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.startsWith(prefix));
}

function issueApi(options: IssueApiOptions = {}) {
  return () => {
    api = mockIssueApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${ISSUE_PROJECT_ID}/issues`;

const meta = {
  title: "Tracking/Issues/List",
  component: IssuesList,
  args: { projectId: ISSUE_PROJECT_ID, today: "2026-10-14" },
  beforeEach: issueApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <IssuesList {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof IssuesList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each issue with its status word, priority chip and dates. */
export const List: Story = {
  play: async ({ canvas }) => {
    // The test browser is phone-sized (414 px): the list shows as cards.
    const list = within(
      await canvas.findByRole("list", { name: "Issues & Snags" }),
    );
    const rows = list.getAllByRole("listitem");
    await expect(rows).toHaveLength(4);
    const [pending, delayed, solved, closed] = rows;
    if (pending == null || delayed == null || solved == null || closed == null)
      throw new Error("four issues");
    await expect(
      within(pending).getByRole("link", { name: "ISS/26-27/00004" }),
    ).toHaveAttribute("href", `${BASE}/${PENDING_ID}`);
    await expect(within(pending).getByText("Pending")).toBeVisible();
    await expect(within(pending).getByText("High")).toBeVisible();
    await expect(within(delayed).getByText("Delayed")).toBeVisible();
    await expect(within(delayed).getByText("Medium")).toBeVisible();
    await expect(within(solved).getByText("Solved")).toBeVisible();
    await expect(within(solved).getByText("Low")).toBeVisible();
    await expect(within(closed).getByText("Closed")).toBeVisible();
    await expect(
      within(closed).getByRole("checkbox", { name: "Select ISS/26-27/00001" }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      canvas.getByRole("link", { name: "Add Issue" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** The status chips filter on Pending, Delayed, Solved and Closed together. */
export const StatusChips: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Issues & Snags" });
    const status = within(canvas.getByRole("group", { name: "Status" }));
    await userEvent.click(status.getByRole("button", { name: "Pending" }));
    await userEvent.click(status.getByRole("button", { name: "Delayed" }));
    await waitFor(async () => {
      await expect(
        calls("GET", `${ISSUES_API}?`).some((call) =>
          call.path.includes("status=pending%2Cdelayed"),
        ),
      ).toBe(true);
    });
    await waitFor(async () => {
      await expect(
        within(
          canvas.getByRole("list", { name: "Issues & Snags" }),
        ).getAllByRole("listitem"),
      ).toHaveLength(2);
    });
  },
};

/** Select issues, Mark As Solved: the solved ones are skipped and counted. */
export const BulkMarkAsSolved: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Issues & Snags" });
    for (const number of [
      "ISS/26-27/00004",
      "ISS/26-27/00003",
      "ISS/26-27/00002",
    ]) {
      const [box] = canvas.getAllByRole("checkbox", {
        name: `Select ${number}`,
      });
      if (box == null) throw new Error(number);
      await userEvent.click(box);
    }
    await expect(canvas.getByText("3 selected")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Verify (1)" }),
    ).toBeEnabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark As Solved (2)" }),
    );
    await waitFor(async () => {
      await expect(calls("POST", `${ISSUES_API}/bulk-solve`)[0]?.body).toEqual({
        projectId: ISSUE_PROJECT_ID,
        ids: [PENDING_ID, DELAYED_ID, SOLVED_ID],
      });
    });
    await expect(
      await canvas.findByText(
        "2 issues marked as solved. 1 skipped: already solved or closed.",
      ),
    ).toBeVisible();
  },
};

/** Approvers verify solved issues together. */
export const BulkVerify: Story = {
  beforeEach: issueApi({
    flags: { "tracking.issues": ["read", "approve", "view_all"] },
  }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Issues & Snags" });
    const [box] = canvas.getAllByRole("checkbox", {
      name: "Select ISS/26-27/00002",
    });
    if (box == null) throw new Error("checkbox");
    await userEvent.click(box);
    await expect(
      canvas.queryByRole("button", { name: /Mark As Solved/ }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Verify (1)" }));
    await expect(await canvas.findByText("1 issue verified.")).toBeVisible();
    await expect(
      calls("POST", `${ISSUES_API}/bulk-verify`)[0]?.body,
    ).toMatchObject({ ids: [SOLVED_ID] });
  },
};

/** No issues yet: the empty state offers Add Issue. */
export const Empty: Story = {
  beforeEach: issueApi({ issues: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No issues or snags yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Issue" }),
    ).toHaveLength(2);
  },
};

/** Read only: no Add, no selection. */
export const ReadOnly: Story = {
  beforeEach: issueApi({ flags: { "tracking.issues": ["read"] } }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Issues & Snags" });
    await expect(canvas.queryByRole("link", { name: "Add Issue" })).toBeNull();
    await expect(canvas.queryAllByRole("checkbox")).toHaveLength(0);
  },
};

/** At 375 px the list is cards and the page does not scroll sideways. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findAllByText("ISS/26-27/00004");
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
