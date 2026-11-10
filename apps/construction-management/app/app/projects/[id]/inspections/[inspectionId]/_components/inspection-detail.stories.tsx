import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";

import {
  ALBUM_ID,
  APPROVED_ID,
  INSPECTION_PROJECT_ID,
  INSPECTIONS_API,
  inspection,
  mockInspectionApi,
  PENDING_ID,
  REINSPECTION,
  REINSPECTION_ID,
  REJECTED_ID,
  SNAG_ID,
  type InspectionApiOptions,
} from "./inspection-fixtures";
import { InspectionDetail } from "./inspection-detail";

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

const PROJECT = `/app/projects/${INSPECTION_PROJECT_ID}`;
const BASE = `${PROJECT}/inspections`;

const meta = {
  title: "Tracking/Inspections/Detail",
  component: InspectionDetail,
  args: { projectId: INSPECTION_PROJECT_ID, id: PENDING_ID },
  beforeEach: inspectionApi(),
  parameters: {
    nextjs: { navigation: { pathname: `${BASE}/${PENDING_ID}` } },
  },
  render: (args) => (
    <StoryQueries>
      <InspectionDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof InspectionDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A pending request: fields, the linked drawing, observations, remarks; approve it. */
export const Pending: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "IR/26-27/00004" }),
    ).toBeVisible();
    const decision = within(canvas.getByRole("region", { name: "Decision" }));
    await expect(decision.getByText("Pending for approval")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Ground floor slab" }),
    ).toHaveAttribute("href", `${PROJECT}/drawings/${ALBUM_ID}`);
    await expect(canvas.getByText("Structural · R2")).toBeVisible();
    await expect(
      await canvas.findByText(
        "Cover blocks 20 mm at C4; two missing near the cut-out.",
      ),
    ).toBeVisible();
    await expect(
      await canvas.findByText(
        "Contractor says the blocks arrive this afternoon.",
      ),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${BASE}/${PENDING_ID}/edit`,
    );
    await userEvent.click(decision.getByRole("button", { name: "Approve" }));
    await expect(
      await canvas.findByText(/^Approved by Karthik R/),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
  },
};

/** Reject with a reason and **Also raise a snag**; the snag link appears. */
export const RejectWithSnag: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const decision = within(
      await canvas.findByRole("region", { name: "Decision" }),
    );
    await userEvent.click(decision.getByRole("button", { name: "Reject" }));
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    );
    await userEvent.type(
      dialog.getByLabelText("Reason"),
      "Cover blocks missing",
    );
    await userEvent.click(
      dialog.getByRole("checkbox", { name: "Also raise a snag" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(
        posts(`${INSPECTIONS_API}/${PENDING_ID}/reject`)[0]?.body,
      ).toMatchObject({ reason: "Cover blocks missing", raiseSnag: true });
    });
    await expect(
      await canvas.findByRole("link", { name: "ISS/26-27/00012" }),
    ).toHaveAttribute("href", `${PROJECT}/issues/${SNAG_ID}`);
    await expect(canvas.getByText("Cover blocks missing")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Raise re-inspection" }),
    ).toHaveAttribute("href", `${BASE}/new?reinspect=${PENDING_ID}`);
  },
};

/** A rejected request: reason, the snag raised from it and **Raise re-inspection**. */
export const Rejected: Story = {
  args: { id: REJECTED_ID },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Lap joints not sealed at the parapet."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "ISS/26-27/00011" }),
    ).toHaveAttribute("href", `${PROJECT}/issues/${SNAG_ID}`);
    await expect(
      canvas.getByRole("link", { name: "Raise re-inspection" }),
    ).toHaveAttribute("href", `${BASE}/new?reinspect=${REJECTED_ID}`);
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(
      canvas.queryByRole("form", { name: "Add an observation" }),
    ).toBeNull();
    // Remarks stay open.
    await expect(
      await canvas.findByRole("form", { name: "Add a remark" }),
    ).toBeVisible();
  },
};

/** An approved request is read-only apart from remarks. */
export const Approved: Story = {
  args: { id: APPROVED_ID },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(/^Approved by Meena Iyer/),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Delete" })).toBeNull();
    const remark = within(
      await canvas.findByRole("form", { name: "Add a remark" }),
    );
    await userEvent.type(remark.getByLabelText("Remark"), "Pour on Friday");
    await userEvent.click(remark.getByRole("button", { name: "Add remark" }));
    await expect(await canvas.findByText("Pour on Friday")).toBeVisible();
  },
};

/** A re-inspection links back to the rejected request. */
export const Reinspection: Story = {
  args: { id: REINSPECTION_ID },
  beforeEach: inspectionApi({ inspections: [REINSPECTION] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "IR/26-27/00002" }),
    ).toHaveAttribute("href", `${BASE}/${REJECTED_ID}`);
    await expect(canvas.getByText(/Re-inspection of/)).toBeVisible();
  },
};

/** The inspector adds an observation; an empty one is refused. */
export const AddObservation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Add an observation" }),
    );
    await userEvent.click(
      form.getByRole("button", { name: "Add observation" }),
    );
    await expect(
      await form.findByText("Write the observation, or add a photo or file."),
    ).toBeVisible();
    await userEvent.type(
      form.getByLabelText("Observation"),
      "Chairs at 1 m spacing; fine.",
    );
    await userEvent.click(
      form.getByRole("button", { name: "Add observation" }),
    );
    await expect(
      await canvas.findByText("Chairs at 1 m spacing; fine."),
    ).toBeVisible();
    await expect(
      posts(`${INSPECTIONS_API}/${PENDING_ID}/observations`)[0]?.body,
    ).toEqual({ body: "Chairs at 1 m spacing; fine.", fileIds: [] });
  },
};

/** Without Approve, Reject, Update or Delete only remarks remain. */
export const ReadOnly: Story = {
  beforeEach: inspectionApi({
    flags: { "tracking.inspection_requests": ["read"] },
    inspections: [
      inspection({
        inspector: null,
        actions: {
          edit: false,
          delete: false,
          approve: false,
          reject: false,
          observe: false,
          remark: true,
          reinspect: false,
          raiseSnag: false,
          print: false,
        },
      }),
    ],
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "IR/26-27/00004" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Anyone with Approve or Reject can decide it."),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(
      await canvas.findByRole("form", { name: "Add a remark" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("form", { name: "Add an observation" }),
    ).toBeNull();
  },
};
