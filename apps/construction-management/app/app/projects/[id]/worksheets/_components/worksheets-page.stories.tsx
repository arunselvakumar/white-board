import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  WORKSHEET_SETTINGS_API,
  WORKSHEETS_API,
} from "@/src/queries/worksheets";

import {
  mockWorksheetApi,
  PROJECT_ID,
  TODAY,
  worksheet,
  type WorksheetApiOptions,
} from "./worksheet-fixtures";
import { WorksheetsPage } from "./worksheets-page";

let api: ReturnType<typeof mockWorksheetApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function withApi(options: WorksheetApiOptions = {}) {
  return () => {
    api = mockWorksheetApi(options);
    return api.restore;
  };
}

const PENDING = [
  worksheet({
    number: "WS/26-27/00011",
    approvalStatus: "pending",
    actions: {
      edit: true,
      delete: true,
      approve: true,
      reject: true,
      duplicate: true,
    },
  }),
  worksheet({
    number: "WS/26-27/00012",
    shift: "shift_2",
    approvalStatus: "pending",
    actions: {
      edit: true,
      delete: true,
      approve: true,
      reject: true,
      duplicate: true,
    },
  }),
  worksheet({
    number: "WS/26-27/00010",
    approvalStatus: "approved",
    decidedAt: "2026-10-10T12:00:00.000Z",
    decidedBy: { userId: "user-arun", name: "Arun Selva Kumar" },
  }),
];

const meta = {
  title: "Site work/Daily Worksheet/List",
  component: WorksheetsPage,
  args: { projectId: PROJECT_ID, today: TODAY },
  beforeEach: withApi(),
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl p-6">
        <WorksheetsPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof WorksheetsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Approval off: no status, approval filter or bulk approval. */
export const WithoutApproval: Story = {
  beforeEach: withApi({
    items: [worksheet({ number: "WS/26-27/00007" }), worksheet()],
  }),
  play: async ({ canvas }) => {
    await expect(
      (await canvas.findAllByText("WS/26-27/00007")).length,
    ).toBeGreaterThan(0);
    await expect(
      canvas.getAllByText(/4 skilled · 6 unskilled/).length,
    ).toBeGreaterThan(0);
    await expect(canvas.getByText("2 worksheets")).toBeVisible();
    await expect(canvas.queryByText("Pending")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Bulk approval" }),
    ).toBeNull();
    await expect(canvas.queryByLabelText("Approval")).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Add Worksheet" }),
    ).toBeVisible();
  },
};

function first(elements: HTMLElement[]): HTMLElement {
  const element = elements[0];
  if (element == null) throw new Error("Not found");
  return element;
}

/** Approval on: statuses, and bulk approve of the pending ones only. */
export const WithApproval: Story = {
  beforeEach: withApi({
    settings: { approvalEnabled: true },
    items: PENDING,
  }),
  play: async ({ canvas, userEvent }) => {
    await expect(
      (await canvas.findAllByText("Approved")).length,
    ).toBeGreaterThan(0);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    await expect(
      first(canvas.getAllByRole("checkbox", { name: "Select WS/26-27/00010" })),
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select WS/26-27/00011" })),
    );
    await userEvent.click(
      first(canvas.getAllByRole("checkbox", { name: "Select WS/26-27/00012" })),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Approve (2)" }));
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "2 worksheets approved.",
    );
    await expect(posts(`${WORKSHEETS_API}/bulk-approve`)[0]?.body).toEqual({
      projectId: PROJECT_ID,
      ids: [PENDING[0]?.id, PENDING[1]?.id],
    });
  },
};

/** Bulk reject asks for one reason for all. */
export const BulkReject: Story = {
  beforeEach: withApi({
    settings: { approvalEnabled: true },
    items: PENDING,
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    await userEvent.click(
      first(
        await canvas.findAllByRole("checkbox", {
          name: "Select WS/26-27/00011",
        }),
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Reject (1)" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(dialog.getByLabelText("Reason"), "Headcount too high");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(posts(`${WORKSHEETS_API}/bulk-reject`)[0]?.body).toEqual({
        projectId: PROJECT_ID,
        ids: [PENDING[0]?.id],
        reason: "Headcount too high",
      });
    });
  },
};

/** No sheets yet: say what a worksheet is and offer to add one. */
export const Empty: Story = {
  beforeEach: withApi({ items: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No worksheets yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Worksheet" }),
    ).toHaveLength(2);
  },
};

/** A member with Read only sees no add, gear or bulk approval. */
export const ReadOnly: Story = {
  beforeEach: withApi({ flags: ["read"] }),
  play: async ({ canvas }) => {
    await canvas.findAllByText(/^WS\/26-27\//);
    await canvas.findByText("1 worksheet");
    await expect(
      canvas.queryByRole("link", { name: "Add Worksheet" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Worksheet settings" }),
    ).toBeNull();
  },
};

/** The gear: toggles, section order with up / down, and approval. */
export const Settings: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Worksheet settings" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Daily Worksheet settings",
      }),
    );
    await userEvent.click(
      await dialog.findByRole("switch", { name: "Work Type" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Move Material Consumption up" }),
    );
    await expect(
      within(dialog.getByRole("list", { name: "Section order" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "1. Location Details",
      "2. Material Consumption",
      "3. Basic Details",
      "4. Other Details",
    ]);
    await userEvent.click(
      dialog.getByRole("switch", { name: "Worksheets need approval" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Save settings" }),
    );
    await waitFor(async () => {
      await expect(posts(WORKSHEET_SETTINGS_API)[0]?.body).toEqual({
        projectId: PROJECT_ID,
        showLocation: true,
        showWorkType: false,
        showApproxWorkDone: true,
        showLabour: true,
        showMaterials: true,
        showRemark: true,
        showPhotos: true,
        sectionOrder: ["location", "materials", "basic", "other"],
        approvalEnabled: true,
        expectedUpdatedAt: null,
      });
    });
  },
};
