import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  INSPECTION_PROJECT_ID,
  INSPECTIONS_API,
  mockInspectionApi,
  PENDING_ID,
  inspection,
  APPROVED,
  REJECTED,
  type InspectionApiOptions,
} from "./inspection-fixtures";
import { InspectionsList } from "./inspections-list";

let api: ReturnType<typeof mockInspectionApi>;

function inspectionApi(options: InspectionApiOptions = {}) {
  return () => {
    api = mockInspectionApi(options);
    return api.restore;
  };
}

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

const BASE = `/app/projects/${INSPECTION_PROJECT_ID}/inspections`;
const SECOND_PENDING = "0199c4a0-0000-7000-8000-0000000d1005";

const meta = {
  title: "Tracking/Inspections/List",
  component: InspectionsList,
  args: { projectId: INSPECTION_PROJECT_ID, today: "2026-10-14" },
  beforeEach: inspectionApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <InspectionsList {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof InspectionsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each request with its number, inspection time, work, contractor, inspector and status. */
export const Requests: Story = {
  play: async ({ canvas }) => {
    const list = await canvas.findByRole("list", {
      name: "Inspection Requests",
    });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const t = within(list);
    await expect(
      t.getByRole("link", { name: "IR/26-27/00004" }),
    ).toHaveAttribute("href", `${BASE}/${PENDING_ID}`);
    await expect(t.getByText("Pending for approval")).toBeVisible();
    await expect(t.getByText("Approved")).toBeVisible();
    await expect(t.getByText("Rejected")).toBeVisible();
    await expect(t.getAllByText(/Velan Constructions/)).toHaveLength(3);
    await expect(
      canvas.getByRole("button", { name: "Pending for approval (1)" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Inspection Request" }),
    ).toHaveAttribute("href", `${BASE}/new`);
  },
};

/** The status chips filter the list and keep their counts. */
export const StatusChips: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Inspection Requests" });
    await userEvent.click(canvas.getByRole("button", { name: "Rejected (1)" }));
    await waitFor(async () => {
      await expect(
        within(
          canvas.getByRole("list", { name: "Inspection Requests" }),
        ).getAllByRole("listitem"),
      ).toHaveLength(1);
    });
    await expect(
      canvas.getByRole("link", { name: "IR/26-27/00002" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "All (3)" })).toBeVisible();
  },
};

/** Bulk approval decides only the pending ones; decided rows cannot be picked. */
export const BulkApprove: Story = {
  beforeEach: inspectionApi({
    inspections: [
      inspection(),
      inspection({ id: SECOND_PENDING, number: "IR/26-27/00006" }),
      APPROVED,
      REJECTED,
    ],
  }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Inspection Requests" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Bulk approval" }),
    );
    const table = within(
      canvas.getByRole("list", { name: "Inspection Requests" }),
    );
    await expect(
      table.getByRole("checkbox", { name: "Select IR/26-27/00003" }),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      table.getByRole("checkbox", { name: "Select IR/26-27/00004" }),
    );
    await userEvent.click(
      table.getByRole("checkbox", { name: "Select IR/26-27/00006" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (2)" }));
    await expect(await canvas.findByText("2 requests approved.")).toBeVisible();
    await expect(posts(`${INSPECTIONS_API}/bulk-approve`)[0]?.body).toEqual({
      projectId: INSPECTION_PROJECT_ID,
      ids: [PENDING_ID, SECOND_PENDING],
    });
  },
};

/** Bulk reject takes one reason and can raise a snag for each. */
export const BulkRejectWithSnags: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Inspection Requests" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Bulk approval" }),
    );
    await userEvent.click(
      within(
        canvas.getByRole("list", { name: "Inspection Requests" }),
      ).getByRole("checkbox", { name: "Select IR/26-27/00004" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Reject (1)" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await dialog.findByText("Write why it is rejected."),
    ).toBeVisible();
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Cover blocks missing",
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Also raise a snag" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(
      await canvas.findByText("1 request rejected · 1 snag raised."),
    ).toBeVisible();
    await expect(posts(`${INSPECTIONS_API}/bulk-reject`)[0]?.body).toEqual({
      projectId: INSPECTION_PROJECT_ID,
      ids: [PENDING_ID],
      reason: "Cover blocks missing",
      raiseSnag: true,
    });
  },
};

/** Without Issues & Snags Create, the reject dialog does not offer a snag. */
export const BulkRejectWithoutSnag: Story = {
  beforeEach: inspectionApi({
    flags: {
      "tracking.inspection_requests": ["read", "reject"],
      "tracking.issues": ["read"],
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Inspection Requests" });
    await expect(
      canvas.queryByRole("link", { name: "Add Inspection Request" }),
    ).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Bulk approval" }),
    );
    await expect(
      canvas.queryByRole("button", { name: /^Approve \(/ }),
    ).toBeNull();
    await userEvent.click(
      within(
        canvas.getByRole("list", { name: "Inspection Requests" }),
      ).getByRole("checkbox", { name: "Select IR/26-27/00004" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Reject (1)" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await expect(
      dialog.queryByRole("checkbox", { name: "Also raise a snag" }),
    ).toBeNull();
  },
};

/** A Project with no requests offers Add Inspection Request. */
export const Empty: Story = {
  beforeEach: inspectionApi({ inspections: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Inspection Requests yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Inspection Request" }),
    ).toHaveLength(2);
  },
};

/** A search with no match says so. */
export const NoMatch: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "Inspection Requests" });
    await userEvent.type(
      await canvas.findByRole("searchbox", {
        name: "Search by Request No or work",
      }),
      "plaster",
    );
    await expect(
      await canvas.findByText("No Inspection Requests match"),
    ).toBeVisible();
  },
};
