import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { PurchaseRequestDetailPage } from "./purchase-request-detail";
import {
  CEMENT,
  PARTLY_ORDERED_PR,
  PENDING_PR,
  PROJECT_ID,
  procurementAccess,
  purchaseRequestsHandler,
  REJECTED_PR,
  STEEL,
  TODAY,
  type PrApiOptions,
} from "./purchase-request-fixtures";
import { PurchaseRequestWizard } from "./purchase-request-wizard";
import { PurchaseRequestsPage } from "./purchase-requests-page";

let api: ReturnType<typeof mockApi>;

function serve(options: PrApiOptions = {}) {
  return () => {
    api = mockApi(purchaseRequestsHandler(options));
    return api.restore;
  };
}

function calls(method: string, pathPart: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path.includes(pathPart));
}

const meta = {
  title: "Procurement/Purchase Requests",
  component: PurchaseRequestsPage,
  args: { projectId: PROJECT_ID, today: TODAY },
  render: (args) => (
    <StoryQueries>
      <div className="max-w-6xl p-4">
        <PurchaseRequestsPage {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof PurchaseRequestsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Requests with both statuses; a chip filters by approval or fulfilment. */
export const List: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      (await canvas.findAllByText(PENDING_PR.number)).length,
    ).toBeGreaterThan(0);
    await expect(canvas.getByText("3 Purchase Requests")).toBeVisible();
    await expect(
      canvas.getAllByText("Partially Ordered").length,
    ).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole("button", { name: "Rejected" }));
    await waitFor(async () => {
      await expect(calls("GET", "approvalStatus=rejected")).toHaveLength(1);
    });
    await expect(await canvas.findByText("1 Purchase Request")).toBeVisible();
    await expect(
      canvas.getAllByText(REJECTED_PR.number).length,
    ).toBeGreaterThan(0);
    await userEvent.click(
      canvas.getByRole("button", { name: "Partially Ordered" }),
    );
    await waitFor(async () => {
      await expect(calls("GET", "orderStatus=partially_ordered")).toHaveLength(
        1,
      );
    });
  },
};

/** Bulk approval mode: only pending rows can be picked; Approve sends them all. */
export const BulkApprove: Story = {
  beforeEach: serve(),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Bulk approval" }),
    );
    const pick = canvas.getAllByRole("checkbox", {
      name: `Select ${PENDING_PR.number}`,
    })[0];
    if (pick == null) throw new Error("no checkbox");
    await expect(
      canvas.getAllByRole("checkbox", {
        name: `Select ${REJECTED_PR.number}`,
      })[0],
    ).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(pick);
    await userEvent.click(canvas.getByRole("button", { name: "Approve (1)" }));
    await waitFor(async () => {
      await expect(calls("POST", "/bulk-approve")[0]?.body).toEqual({
        projectId: PROJECT_ID,
        ids: [PENDING_PR.id],
      });
    });
    await expect(await canvas.findByText("1 request approved.")).toBeVisible();
  },
};

/** No requests yet: an empty state with Add Purchase Request. */
export const Empty: Story = {
  beforeEach: serve({ items: [] }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No Purchase Requests yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Purchase Request" }).length,
    ).toBeGreaterThan(0);
  },
};

/** A reader without Create or Approve sees no add or bulk buttons. */
export const ReadOnly: Story = {
  beforeEach: serve({
    access: procurementAccess({ purchaseRequests: ["read"] }),
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByText(PENDING_PR.number);
    await waitFor(async () => {
      await expect(calls("GET", "/procurement/access")).toHaveLength(1);
    });
    await expect(
      canvas.queryByRole("link", { name: "Add Purchase Request" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Bulk approval" }),
    ).toBeNull();
  },
};

/** Phone width: cards, no sideways scroll. */
export const Phone: Story = {
  beforeEach: serve(),
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByText(PENDING_PR.number);
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth + 1,
    );
  },
};

/** The three steps: pick, quantities with stock, details; Save & Approve. */
export const Wizard: StoryObj<typeof PurchaseRequestWizard> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseRequestWizard projectId={PROJECT_ID} today={TODAY} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Next" }));
    await expect(
      await canvas.findByText("Pick at least one material"),
    ).toBeVisible();
    const picker = await canvas.findByLabelText("Add a material");
    await waitFor(async () => {
      await expect(
        within(picker).getAllByRole("option").length,
      ).toBeGreaterThan(2);
    });
    await userEvent.selectOptions(picker, CEMENT.id);
    await userEvent.selectOptions(picker, STEEL.id);
    await userEvent.click(
      canvas.getByRole("button", { name: "View Selected (2)" }),
    );
    await expect(
      canvas.getByRole("list", { name: "Selected materials" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    // Step 2: stock and balanced estimate per material.
    await expect(
      await canvas.findByText(
        /Available Stock: 40 Bag · Balanced estimated qty: 360 Bag/,
      ),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText(`Quantity of ${CEMENT.name}`),
      "100",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(
      await canvas.findByText(
        "Enter a quantity more than 0 (at most three decimals)",
      ),
    ).toBeVisible();
    await userEvent.type(
      canvas.getByLabelText(`Quantity of ${STEEL.name}`),
      "1250.5",
    );
    await userEvent.type(
      canvas.getByLabelText("Common Remark"),
      "For the slab",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));

    // Step 3: details.
    await expect(
      await canvas.findByLabelText("Purchase Request Date"),
    ).toHaveValue(TODAY);
    await userEvent.type(canvas.getByLabelText("Required Date"), "2026-10-15");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save & Approve" }),
    );
    await waitFor(async () => {
      await expect(calls("POST", "/purchase-requests")[0]?.body).toEqual({
        projectId: PROJECT_ID,
        source: "manual",
        requestDate: TODAY,
        requiredDate: "2026-10-15",
        siteLocation: null,
        remark: null,
        separateRemarks: false,
        commonRemark: "For the slab",
        items: [
          { materialId: CEMENT.id, quantity: "100", remark: null },
          { materialId: STEEL.id, quantity: "1250.5", remark: null },
        ],
        approve: true,
      });
    });
  },
};

/** Mode B: materials preloaded from Current Inventory; a remark per item. */
export const WizardFromInventory: StoryObj<typeof PurchaseRequestWizard> = {
  beforeEach: serve({
    access: procurementAccess({ purchaseRequests: ["read", "create"] }),
  }),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseRequestWizard
          projectId={PROJECT_ID}
          today={TODAY}
          initialMaterialIds={[CEMENT.id]}
        />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: `Remove ${CEMENT.name}` }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.type(
      await canvas.findByLabelText(`Quantity of ${CEMENT.name}`),
      "25",
    );
    await userEvent.click(
      canvas.getByRole("switch", { name: "Separate remark for each item" }),
    );
    await userEvent.type(
      canvas.getByLabelText(`Remark for ${CEMENT.name}`),
      "53 grade only",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(
      canvas.queryByRole("button", { name: "Save & Approve" }),
    ).toBeNull();
    await userEvent.click(await canvas.findByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const body = calls("POST", "/purchase-requests")[0]?.body as {
        source: string;
        separateRemarks: boolean;
        items: unknown[];
      };
      await expect(body.source).toBe("inventory");
      await expect(body.separateRemarks).toBe(true);
      await expect(body.items).toEqual([
        { materialId: CEMENT.id, quantity: "25", remark: "53 grade only" },
      ]);
    });
  },
};

/** Editing a rejected request opens on its lines. */
export const WizardEdit: StoryObj<typeof PurchaseRequestWizard> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseRequestWizard
          projectId={PROJECT_ID}
          today={TODAY}
          existing={REJECTED_PR}
        />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Next" }));
    await expect(
      await canvas.findByLabelText(`Quantity of ${CEMENT.name}`),
    ).toHaveValue("100");
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Save" }));
    await waitFor(async () => {
      const body = calls("POST", `/${REJECTED_PR.id}/update`)[0]?.body as {
        expectedUpdatedAt: string;
      };
      await expect(body.expectedUpdatedAt).toBe(REJECTED_PR.updatedAt);
    });
  },
};

/** The detail of a pending request: lines, Reject with a reason. */
export const DetailPending: StoryObj<typeof PurchaseRequestDetailPage> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseRequestDetailPage projectId={PROJECT_ID} id={PENDING_PR.id} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: PENDING_PR.number }),
    ).toBeVisible();
    await expect(
      canvas.getByText("For the 3rd floor slab casting"),
    ).toBeVisible();
    await expect(
      await canvas.findByText("Location · Culvert C3"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reject" }));
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await expect(await dialog.findByText("Write a reason.")).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Over budget");
    await userEvent.click(dialog.getByRole("button", { name: "Reject" }));
    await waitFor(async () => {
      await expect(calls("POST", `/${PENDING_PR.id}/reject`)[0]?.body).toEqual({
        reason: "Over budget",
        expectedUpdatedAt: PENDING_PR.updatedAt,
      });
    });
  },
};

/** A partially ordered request: Generate PO, Mark as Ordered, linked POs. */
export const DetailPartlyOrdered: StoryObj<typeof PurchaseRequestDetailPage> = {
  beforeEach: serve(),
  render: () => (
    <StoryQueries>
      <div className="p-4">
        <PurchaseRequestDetailPage
          projectId={PROJECT_ID}
          id={PARTLY_ORDERED_PR.id}
        />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: "PO/26-27/00001" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Generate PO" }),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Edit" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark as Ordered" }),
    );
    await waitFor(async () => {
      await expect(
        calls("POST", `/${PARTLY_ORDERED_PR.id}/mark-ordered`),
      ).toHaveLength(1);
    });
  },
};
