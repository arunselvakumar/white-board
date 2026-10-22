import { z } from "zod";

import type { AdvancesAndRetention } from "@/src/contracts/application/advance-handlers";
import {
  ADVANCE_REMARKS_MAX,
  GUARANTEE_BANK_MAX,
  GUARANTEE_NUMBER_MAX,
  RELEASE_REASON_MAX,
} from "@/src/contracts/domain/advance";
import {
  ADVANCE_DIRECTIONS,
  ADVANCE_KINDS,
  GUARANTEE_PURPOSES,
  RECOVERY_MODES,
  RETENTION_STAGES,
  WORK_ORDER_STATUSES,
} from "@/src/contracts/domain/contract-terms";
import {
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import { FLAGS } from "@/src/shared-kernel/access";

/**
 * Advances, bank guarantees, retention releases and DLP (CM-1108). A
 * request names its contract by `projectId` and, on the contractor side,
 * `workOrderId`; without a Work Order it is the Project's client contract.
 * Every write answers with the whole contract's advances and retention.
 */
export const ADVANCES_PATH = "/api/construction/contracts/advances";
export const GUARANTEES_PATH = "/api/construction/contracts/guarantees";
export const RETENTION_RELEASES_PATH =
  "/api/construction/contracts/retention-releases";

const date = (description: string) =>
  z.string().max(30).describe(`YYYY-MM-DD. ${description}`);
const expected = z.iso
  .datetime()
  .describe(
    "The record's `updatedAt` as loaded; a stale one is refused with 409.",
  );
const optionalExpected = expected.optional();

const contract = {
  projectId: z.uuid(),
  workOrderId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "The Work Order (contractor side, Work Order menu). Left out: the Project's client contract (Client Bills menu).",
    ),
};

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const ConstructionContractsAdvanceParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionContractsClientContractQueryModel = z.object({
  projectId: z.uuid(),
});

const recoveryValue = z
  .union([z.string().max(30), z.int()])
  .nullable()
  .optional()
  .describe(
    "`percent`: more than 0 up to 100, two places (blank on a mobilisation advance takes the Work Order's recovery %); `fixed`: paise per bill, at most the advance (400 RECOVERY_VALUE_INVALID / RECOVERY_VALUE_REQUIRED).",
  );

export const CreateConstructionContractsAdvanceRequestModel = z.object({
  ...contract,
  kind: z.enum(ADVANCE_KINDS),
  amount: z
    .int()
    .describe(
      "Paise, more than ₹0 up to ₹100 crore (400 ADVANCE_AMOUNT_INVALID).",
    ),
  advanceOn: date("Not after today (400 ADVANCE_ON_IN_FUTURE)."),
  recoveryMode: z.enum(RECOVERY_MODES),
  recoveryValue,
  remarks: z
    .string()
    .max(5000)
    .nullable()
    .optional()
    .describe(`At most ${String(ADVANCE_REMARKS_MAX)} characters.`),
  accountId: z
    .uuid()
    .describe("The finance account the money went out of (or came into)."),
  mode: z.enum(["cash", "cheque", "online", "upi"]),
  chequeNumber: z.string().max(200).nullable().optional(),
  reference: z.string().max(200).nullable().optional(),
  modeDate: z.string().max(30).nullable().optional(),
  confirmDuplicateReference: z
    .boolean()
    .optional()
    .describe(
      "Save anyway when the cheque number or reference is used (409 DUPLICATE_REFERENCE).",
    ),
});

export const UpdateConstructionContractsAdvanceRequestModel = z.object({
  expectedUpdatedAt: expected,
  kind: z
    .enum(ADVANCE_KINDS)
    .nullable()
    .optional()
    .describe("Changeable while no bill recovers it (409 ADVANCE_RECOVERED)."),
  recoveryMode: z.enum(RECOVERY_MODES),
  recoveryValue,
  remarks: z.string().max(5000).nullable().optional(),
});

export const ConstructionContractsAdvanceStepRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
});

const guaranteeFields = {
  purpose: z.enum(GUARANTEE_PURPOSES),
  number: z
    .string()
    .max(1000)
    .describe(`At most ${String(GUARANTEE_NUMBER_MAX)} characters.`),
  bank: z
    .string()
    .max(1000)
    .describe(`At most ${String(GUARANTEE_BANK_MAX)} characters.`),
  amount: z.int().describe("Paise, more than ₹0."),
  issuedOn: date("Not after today."),
  expiresOn: date("On or after the issue date."),
  advanceId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Purpose `advance`: an advance of the same contract (400 GUARANTEE_ADVANCE_REQUIRED / GUARANTEE_ADVANCE_INVALID).",
    ),
  remarks: z.string().max(5000).nullable().optional(),
};

export const CreateConstructionContractsBankGuaranteeRequestModel = z.object({
  ...contract,
  ...guaranteeFields,
});

export const UpdateConstructionContractsBankGuaranteeRequestModel = z.object({
  expectedUpdatedAt: expected,
  ...guaranteeFields,
});

export const ReleaseConstructionContractsBankGuaranteeRequestModel = z.object({
  expectedUpdatedAt: optionalExpected,
  releasedOn: date("On or after the issue date, not after today."),
});

export const CreateConstructionContractsRetentionReleaseRequestModel = z.object(
  {
    ...contract,
    stage: z.enum(RETENTION_STAGES),
    amount: z
      .int()
      .describe(
        "Paise, more than ₹0 up to what is releasable (400 RELEASE_OVER_RELEASABLE, details.max).",
      ),
    releasedOn: date(
      "Not after today. Completion and DLP end need the completion (handover) date (409 COMPLETION_DATE_REQUIRED); DLP end needs the DLP to have ended (409 DLP_NOT_ENDED) unless the caller holds Approve and gives a reason.",
    ),
    reason: z
      .string()
      .max(5000)
      .nullable()
      .optional()
      .describe(
        `At most ${String(RELEASE_REASON_MAX)} characters. Required for "other" and for a DLP-end release before the DLP ends (400 RELEASE_REASON_REQUIRED).`,
      ),
    bankGuaranteeId: z
      .uuid()
      .nullable()
      .optional()
      .describe(
        "Stage `bank_guarantee`: a live retention guarantee of the contract (400 RELEASE_GUARANTEE_REQUIRED / RELEASE_GUARANTEE_INVALID).",
      ),
  },
);

export const DeleteConstructionContractsRetentionReleaseRequestModel = z.object(
  {
    reason: z
      .string()
      .max(5000)
      .describe(
        `Why it is deleted: required, at most ${String(RELEASE_REASON_MAX)} characters (400 DELETE_REASON_REQUIRED). Kept in the audit.`,
      ),
  },
);

export const RecordConstructionContractsWorkOrderCompletionRequestModel =
  z.object({
    completedOn: date(
      "The Work Order's completion, where its DLP starts: on or after its date, not after today.",
    ),
    expectedUpdatedAt: optionalExpected,
  });

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

const money = (description: string) =>
  z.int().nullable().describe(`${description} Null without Financial.`);
const percentText = z.string().describe('Two places ("10.00").');

export const ConstructionContractsAdvanceModel = z.object({
  id: z.uuid(),
  direction: z.enum(ADVANCE_DIRECTIONS),
  kind: z.enum(ADVANCE_KINDS),
  amount: money("Paise."),
  advanceOn: z.string(),
  recoveryMode: z.enum(RECOVERY_MODES),
  recoveryPercent: percentText
    .nullable()
    .describe("`percent`: the % of each bill's gross."),
  recoveryAmount: money("`fixed`: paise per bill."),
  payment: z
    .object({ id: z.uuid(), number: z.string().nullable() })
    .nullable()
    .describe(
      "The finance Payment Out (given) or Payment In (received) on account.",
    ),
  recovered: money("Paise: Σ recoveries on approved bills."),
  balance: money("Paise: amount − recovered."),
  remarks: z.string().nullable(),
  guaranteeIds: z.array(z.uuid()),
  updatedAt: z.iso.datetime(),
});

export const ConstructionContractsBankGuaranteeModel = z.object({
  id: z.uuid(),
  purpose: z.enum(GUARANTEE_PURPOSES),
  number: z.string(),
  bank: z.string(),
  amount: money("Paise."),
  issuedOn: z.string().nullable(),
  expiresOn: z.string(),
  releasedOn: z.string().nullable(),
  status: z.enum(["live", "expired", "released"]),
  daysToExpiry: z.int().describe("Negative once past."),
  advanceId: z.uuid().nullable(),
  remarks: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export const ConstructionContractsRetentionReleaseModel = z.object({
  id: z.uuid(),
  stage: z.enum(RETENTION_STAGES),
  amount: money("Paise."),
  releasedOn: z.string(),
  reason: z.string().nullable(),
  bankGuarantee: z
    .object({ id: z.uuid(), number: z.string().nullable() })
    .nullable(),
  invoice: z
    .object({ id: z.uuid(), number: z.string().nullable() })
    .nullable()
    .describe(
      "The finance invoice (origin `retention_release`): payable to the Contractor or receivable from the Client.",
    ),
  settled: z
    .boolean()
    .describe("Paid or received against: it can no longer be deleted."),
  createdAt: z.iso.datetime(),
  createdByName: z.string().nullable(),
});

export const GetConstructionContractsAdvancesRetentionResponseModel = z.object({
  side: z.enum(["contractor", "client"]),
  projectId: z.uuid(),
  workOrderId: z.uuid().nullable(),
  workOrderNumber: z.string().nullable(),
  workOrderStatus: z.enum(WORK_ORDER_STATUSES).nullable(),
  party: z
    .object({ id: z.uuid(), name: z.string().nullable() })
    .nullable()
    .describe("The Contractor (Work Order) or the Project's Client."),
  advances: z.array(ConstructionContractsAdvanceModel),
  advanceTotals: z.object({
    amount: money("Paise."),
    recovered: money("Paise."),
    balance: money("Paise."),
  }),
  agreedMobilisation: money(
    "Paise: the Work Order's agreed mobilisation advance; null on the client side.",
  ),
  defaultRecoveryPercent: percentText
    .nullable()
    .describe("The Work Order's mobilisation recovery %."),
  warnings: z
    .array(
      z.object({
        code: z.literal("ADVANCES_OVER_AGREED"),
        message: z.string(),
      }),
    )
    .describe(
      "Mobilisation advances given beyond the Work Order's agreed figure (never a refusal). Empty without Financial.",
    ),
  retention: z.object({
    percent: percentText.describe("Retention % per bill."),
    completionPercent: percentText.describe("Released on completion."),
    deducted: money("Paise: retention on approved bills."),
    released: money("Paise: live releases."),
    releasable: money(
      "Paise: held (Work Order) or receivable (client contract) now: deducted − released.",
    ),
    completionSuggestion: money(
      "Paise: completion % × deducted − released, within what is releasable.",
    ),
    dlpEndSuggestion: money("Paise: everything releasable."),
  }),
  releases: z.array(ConstructionContractsRetentionReleaseModel),
  guarantees: z.array(ConstructionContractsBankGuaranteeModel),
  dlp: z.object({
    startsOn: z
      .string()
      .nullable()
      .describe(
        "The Work Order's completion date, or the client contract's handover date.",
      ),
    months: z.int().nullable(),
    endsOn: z.string().nullable(),
    daysLeft: z.int().nullable().describe("Negative once past."),
    ended: z.boolean(),
  }),
  allowed: z.object({
    recordAdvance: z.boolean(),
    update: z.boolean(),
    delete: z.boolean(),
    releaseEarly: z.boolean(),
    setCompletion: z.boolean(),
  }),
  financial: z.boolean(),
  viewerFlags: z.array(z.enum(FLAGS)),
  today: z.string(),
});
export type GetConstructionContractsAdvancesRetentionResponseModel = z.infer<
  typeof GetConstructionContractsAdvancesRetentionResponseModel
>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function toAdvancesRetentionResponse(
  view: AdvancesAndRetention,
): GetConstructionContractsAdvancesRetentionResponseModel {
  const { financial } = view;
  const paise = (value: bigint | null) =>
    financial && value != null ? Number(value) : null;
  const percent = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);
  return {
    side: view.side,
    projectId: view.projectId,
    workOrderId: view.workOrderId,
    workOrderNumber: view.workOrderNumber,
    workOrderStatus: view.workOrderStatus,
    party:
      view.partyId == null ? null : { id: view.partyId, name: view.partyName },
    advances: view.advances.map((row) => ({
      id: row.id,
      direction: row.direction,
      kind: row.kind,
      amount: paise(row.amount),
      advanceOn: row.advanceOn,
      recoveryMode: row.recoveryMode,
      recoveryPercent:
        row.recoveryMode === "percent" ? percent(row.recoveryValue) : null,
      recoveryAmount:
        row.recoveryMode === "fixed" ? paise(row.recoveryValue) : null,
      payment:
        row.paymentId == null
          ? null
          : { id: row.paymentId, number: row.paymentNumber },
      recovered: paise(row.recovered),
      balance: paise(row.balance),
      remarks: row.remarks,
      guaranteeIds: row.guaranteeIds,
      updatedAt: row.updatedAt.toISOString(),
    })),
    advanceTotals: {
      amount: paise(view.advanceTotals.amount),
      recovered: paise(view.advanceTotals.recovered),
      balance: paise(view.advanceTotals.balance),
    },
    agreedMobilisation: paise(view.agreedMobilisation),
    defaultRecoveryPercent:
      view.defaultRecoveryPercent == null
        ? null
        : percent(view.defaultRecoveryPercent),
    warnings: financial
      ? view.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
        }))
      : [],
    retention: {
      percent: percent(view.retentionPercent),
      completionPercent: percent(view.retention.completionPercent),
      deducted: paise(view.retention.deducted),
      released: paise(view.retention.released),
      releasable: paise(view.retention.releasable),
      completionSuggestion: paise(view.retention.completionSuggestion),
      dlpEndSuggestion: paise(view.retention.dlpEndSuggestion),
    },
    releases: view.releases.map((row) => ({
      id: row.id,
      stage: row.stage,
      amount: paise(row.amount),
      releasedOn: row.releasedOn,
      reason: row.reason,
      bankGuarantee:
        row.bankGuaranteeId == null
          ? null
          : { id: row.bankGuaranteeId, number: row.guaranteeNumber },
      invoice:
        row.invoiceId == null
          ? null
          : { id: row.invoiceId, number: row.invoiceNumber },
      settled: row.settled,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdByName,
    })),
    guarantees: view.guarantees.map((row) => ({
      id: row.id,
      purpose: row.purpose,
      number: row.number,
      bank: row.bank,
      amount: paise(row.amount),
      issuedOn: row.issuedOn,
      expiresOn: row.expiresOn,
      releasedOn: row.releasedOn,
      status: row.status,
      daysToExpiry: row.daysToExpiry,
      advanceId: row.advanceId,
      remarks: row.remarks,
      updatedAt: row.updatedAt.toISOString(),
    })),
    dlp: view.dlp,
    allowed: view.allowed,
    financial,
    viewerFlags: view.viewerFlags,
    today: view.today,
  };
}
