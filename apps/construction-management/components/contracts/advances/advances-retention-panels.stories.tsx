import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  ADVANCE,
  BG_RETENTION,
  clientView,
  CONTRACTS_API,
  contractorView,
  posted,
  PROJECT,
  RELEASE,
  serveAdvances,
  TODAY,
  withoutFinancial,
  WORK_ORDER,
} from "./advance-fixtures";
import { AdvancesRetentionPanels } from "./advances-retention-panels";

const meta = {
  title: "Contracts/Advances and retention/Panels",
  component: AdvancesRetentionPanels,
  args: {
    scope: { projectId: PROJECT, workOrderId: WORK_ORDER },
    today: TODAY,
  },
  render: (args) => (
    <StoryQueries>
      <div className="p-6">
        <AdvancesRetentionPanels {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof AdvancesRetentionPanels>;

export default meta;
type Story = StoryObj<typeof meta>;

const contractor = serveAdvances(contractorView());

/**
 * A Work Order's panels: the advance given with what bills recovered,
 * retention held and the completion release, two guarantees (one expiring
 * soon) and the DLP.
 */
export const WorkOrderPanels: Story = {
  beforeEach: contractor.beforeEach,
  play: async ({ canvas }) => {
    const advances = within(
      await canvas.findByRole("region", { name: "Advances given" }),
    );
    await expect(
      advances.getByText(/^Mobilisation advance · 1 Sept? 2026$/),
    ).toBeVisible();
    await expect(
      advances.getByText("Recovered ₹40,000.00 · Balance ₹60,000.00"),
    ).toBeVisible();
    await expect(
      advances.getByText("Bank guarantee BG/2026/090"),
    ).toBeVisible();
    const retention = within(
      canvas.getByRole("region", { name: "Retention held" }),
    );
    await expect(retention.getByText("Held now")).toBeVisible();
    await expect(
      retention.getByText("₹10,000.00 · Invoice WO/26-27/00001/RET-1"),
    ).toBeVisible();
    const guarantees = within(
      canvas.getByRole("region", { name: "Bank guarantees" }),
    );
    await expect(guarantees.getByText("Expires in 12 days")).toBeVisible();
    const dlp = within(
      canvas.getByRole("region", { name: "Defects liability period (DLP)" }),
    );
    await expect(dlp.getByText("12 Oct 2027")).toBeVisible();
    await expect(dlp.getByText("355")).toBeVisible();
  },
};

const record = serveAdvances(contractorView());

/** Record an advance: the form checks what it needs, then posts it as a payment would be. */
export const RecordAdvance: Story = {
  beforeEach: record.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Record advance" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Record an advance given" }),
    );
    await expect(
      dialog.getByLabelText("Recovery % of each bill's gross"),
    ).toHaveValue("10");
    await userEvent.click(
      dialog.getByRole("button", { name: "Record advance" }),
    );
    await expect(
      await dialog.findByText("Enter the advance: more than ₹0."),
    ).toBeVisible();
    await expect(
      dialog.getByText("Enter the UTR or UPI reference."),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Amount"), "25000");
    await userEvent.type(dialog.getByLabelText("Reference"), "UTR-1188");
    await waitFor(() =>
      expect(dialog.getByLabelText("Paid from")).toHaveTextContent(
        "HDFC Current A/c",
      ),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Record advance" }),
    );
    await waitFor(() =>
      expect(
        posted(record.holder.current, `${CONTRACTS_API}/advances`),
      ).toMatchObject({
        projectId: PROJECT,
        workOrderId: WORK_ORDER,
        kind: "mobilisation",
        amount: 25_000_00,
        advanceOn: TODAY,
        recoveryMode: "percent",
        recoveryValue: "10",
        accountId: "0199a000-0000-7000-8000-000000000002",
        mode: "online",
        reference: "UTR-1188",
      }),
    );
  },
};

const recovery = serveAdvances(contractorView());

/** Change how an advance is recovered: a fixed amount per bill. */
export const ChangeRecovery: Story = {
  beforeEach: recovery.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Advance actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Change recovery" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Change the recovery" }),
    );
    await userEvent.click(dialog.getByLabelText("Recovered as"));
    await userEvent.click(
      await body.findByRole("option", { name: "Fixed amount per bill" }),
    );
    await userEvent.type(dialog.getByLabelText("Recovered per bill"), "7500");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        posted(
          recovery.holder.current,
          `${CONTRACTS_API}/advances/${ADVANCE}/update`,
        ),
      ).toEqual({
        expectedUpdatedAt: "2026-09-01T06:00:00.000Z",
        recoveryMode: "fixed",
        recoveryValue: 7_500_00,
        remarks: "Site set-up",
      }),
    );
  },
};

const deleteAdvance = serveAdvances(contractorView());

/** Delete an advance: its payment is cancelled with it. */
export const DeleteAdvance: Story = {
  beforeEach: deleteAdvance.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Advance actions" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete advance" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await expect(
      dialog.getByText(
        /Its payment PAY\/26-27\/00004 is cancelled in Payments/,
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        posted(
          deleteAdvance.holder.current,
          `${CONTRACTS_API}/advances/${ADVANCE}/delete`,
        ),
      ).toEqual({ expectedUpdatedAt: "2026-09-01T06:00:00.000Z" }),
    );
  },
};

const release = serveAdvances(contractorView());

/**
 * Release retention against the retention guarantee: the stage, the
 * amount, the guarantee and the date.
 */
export const ReleaseAgainstGuarantee: Story = {
  beforeEach: release.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Release retention" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Release retention" }),
    );
    await userEvent.click(dialog.getByLabelText("Stage"));
    await userEvent.click(
      await body.findByRole("option", { name: "Against bank guarantee" }),
    );
    await expect(dialog.getByLabelText("Amount")).toHaveValue("10000");
    await userEvent.click(dialog.getByRole("button", { name: "Release" }));
    await expect(
      await dialog.findByText("Pick the retention guarantee."),
    ).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Against bank guarantee"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "BG/2026/118 · State Bank of India",
      }),
    );
    await userEvent.clear(dialog.getByLabelText("Amount"));
    await userEvent.type(dialog.getByLabelText("Amount"), "4000");
    await userEvent.click(dialog.getByRole("button", { name: "Release" }));
    await waitFor(() =>
      expect(
        posted(release.holder.current, `${CONTRACTS_API}/retention-releases`),
      ).toEqual({
        projectId: PROJECT,
        workOrderId: WORK_ORDER,
        stage: "bank_guarantee",
        amount: 4_000_00,
        releasedOn: TODAY,
        reason: null,
        bankGuaranteeId: BG_RETENTION,
      }),
    );
  },
};

const early = serveAdvances(contractorView());

/** A DLP-end release before the DLP ends needs a reason. */
export const ReleaseBeforeDlpEnds: Story = {
  beforeEach: early.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Release retention" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Release retention" }),
    );
    await userEvent.click(dialog.getByLabelText("Stage"));
    await userEvent.click(
      await body.findByRole("option", { name: "End of DLP" }),
    );
    await expect(
      dialog.getByText(
        /The DLP ends on 2027-10-12: releasing earlier needs a reason\./,
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Release" }));
    await expect(
      await dialog.findByText("Say why it is released before the DLP ends."),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Defects closed");
    await userEvent.click(dialog.getByRole("button", { name: "Release" }));
    await waitFor(() =>
      expect(
        posted(early.holder.current, `${CONTRACTS_API}/retention-releases`),
      ).toMatchObject({
        stage: "dlp_end",
        amount: 10_000_00,
        reason: "Defects closed",
      }),
    );
  },
};

const deleteRelease = serveAdvances(contractorView());

/** Delete an unpaid release with a reason; its invoice goes with it. */
export const DeleteRelease: Story = {
  beforeEach: deleteRelease.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const retention = within(
      await canvas.findByRole("region", { name: "Retention held" }),
    );
    await userEvent.click(retention.getByRole("button", { name: "Delete" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Delete this release?" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete release" }),
    );
    await expect(
      await dialog.findByText("Write why it is deleted."),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Reason"), "Wrong amount");
    await userEvent.click(
      dialog.getByRole("button", { name: "Delete release" }),
    );
    await waitFor(() =>
      expect(
        posted(
          deleteRelease.holder.current,
          `${CONTRACTS_API}/retention-releases/${RELEASE}/delete`,
        ),
      ).toEqual({ reason: "Wrong amount" }),
    );
  },
};

const guarantee = serveAdvances(contractorView());

/** Add a bank guarantee: an advance guarantee names its advance. */
export const AddGuarantee: Story = {
  beforeEach: guarantee.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add guarantee" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add a bank guarantee" }),
    );
    await userEvent.click(dialog.getByLabelText("Secures"));
    await userEvent.click(await body.findByRole("option", { name: "Advance" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Add guarantee" }),
    );
    await expect(
      await dialog.findByText("Pick the advance it secures."),
    ).toBeVisible();
    await userEvent.click(dialog.getByLabelText("Advance"));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Mobilisation advance of 2026-09-01 (₹1,00,000.00)",
      }),
    );
    await userEvent.type(dialog.getByLabelText("Guarantee number"), "BG/77");
    await userEvent.type(dialog.getByLabelText("Bank"), "Canara Bank");
    await userEvent.type(dialog.getByLabelText("Amount"), "50000");
    await userEvent.type(dialog.getByLabelText("Expires on"), "2027-06-30");
    await userEvent.click(
      dialog.getByRole("button", { name: "Add guarantee" }),
    );
    await waitFor(() =>
      expect(
        posted(guarantee.holder.current, `${CONTRACTS_API}/guarantees`),
      ).toEqual({
        projectId: PROJECT,
        workOrderId: WORK_ORDER,
        purpose: "advance",
        number: "BG/77",
        bank: "Canara Bank",
        amount: 50_000_00,
        issuedOn: TODAY,
        expiresOn: "2027-06-30",
        advanceId: ADVANCE,
        remarks: null,
      }),
    );
  },
};

const markReleased = serveAdvances(contractorView());

/** Mark a guarantee released (returned to the bank) on a date. */
export const MarkGuaranteeReleased: Story = {
  beforeEach: markReleased.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Guarantee BG/2026/118 actions",
      }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Mark released" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Mark BG/2026/118 released?" }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Mark released" }),
    );
    await waitFor(() =>
      expect(
        posted(
          markReleased.holder.current,
          `${CONTRACTS_API}/guarantees/${BG_RETENTION}/release`,
        ),
      ).toEqual({
        releasedOn: TODAY,
        expectedUpdatedAt: "2026-10-01T06:00:00.000Z",
      }),
    );
  },
};

const completion = serveAdvances(
  contractorView({
    dlp: {
      startsOn: null,
      months: 12,
      endsOn: null,
      daysLeft: null,
      ended: false,
    },
  }),
);

/** Record the Work Order's completion date: the DLP starts there. */
export const RecordCompletion: Story = {
  beforeEach: completion.beforeEach,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByText(
        /The DLP starts on the Work Order's completion date/,
      ),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Record completion" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Completion date" }),
    );
    await userEvent.clear(dialog.getByLabelText("Completed on"));
    await userEvent.type(dialog.getByLabelText("Completed on"), "2026-10-20");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        posted(
          completion.holder.current,
          `${CONTRACTS_API}/work-orders/${WORK_ORDER}/completion`,
        ),
      ).toEqual({ completedOn: "2026-10-20" }),
    );
  },
};

const warned = serveAdvances(
  contractorView({
    warnings: [
      {
        code: "ADVANCES_OVER_AGREED",
        message:
          "Mobilisation advances given (₹1,20,000.00) are more than the ₹1,00,000.00 the Work Order agrees.",
      },
    ],
  }),
);

/** Advances given beyond the agreed mobilisation advance: a warning, not a refusal. */
export const OverAgreed: Story = {
  beforeEach: warned.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        /are more than the ₹1,00,000\.00 the Work Order agrees/,
      ),
    ).toBeVisible();
  },
};

const client = serveAdvances(clientView());

/** The client contract: advances received, retention receivable, DLP from handover. */
export const ClientContract: Story = {
  args: { scope: { projectId: PROJECT, workOrderId: null } },
  beforeEach: client.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("region", { name: "Advances received" }),
    ).toBeVisible();
    const retention = within(
      canvas.getByRole("region", { name: "Retention receivable" }),
    );
    await expect(retention.getByText("Receivable now")).toBeVisible();
    await expect(
      canvas.getByText(
        "The DLP starts on the handover date in the client contract's terms.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Record completion" }),
    ).toBeNull();
  },
};

const reader = serveAdvances(withoutFinancial(contractorView()));

/** Without Financial: no money and no actions. */
export const WithoutFinancial: Story = {
  beforeEach: reader.beforeEach,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("region", { name: "Advances given" }),
    ).toBeVisible();
    await expect(canvas.queryByText("Held now")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Record advance" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Release retention" }),
    ).toBeNull();
  },
};

/** At phone width every panel is a card and nothing scrolls sideways. */
export const Phone: Story = {
  beforeEach: contractor.beforeEach,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("region", { name: "Bank guarantees" }),
    ).toBeVisible();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth + 1,
    );
  },
};
