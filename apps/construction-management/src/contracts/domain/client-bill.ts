import type { DocumentNaming } from "@/src/shared-kernel/approval";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { gstStateName } from "@/src/shared-kernel/gst-states";

import type { DeductionKind } from "./contract-terms";
import { isDeviation, percentOver } from "./deviation";
import {
  assertRaDeductions,
  billGst,
  lineFigures,
  raBillDeductions,
  raBillHeader,
  raRetentionSuggestion,
  type BillDeductionInput,
  type BillGst,
  type BillHeader,
  type BillHeaderInput,
  type LineFigures,
  type RaBillDeduction,
  type RetentionSuggestion,
} from "./ra-bill";
import { workOrderTerms, type WorkOrderTermsInput } from "./work-order";

/**
 * A Client Bill (CM-1107, ADR CM-0023 §7, §11): an outward running-account
 * (RA) bill to the Project's Client on a **Contract work** Project, on the
 * same engine as a Contractor Bill (`ra-bill.ts`). It takes every
 * **checked** client-side measurement row of the Project measured up to its
 * date and not taken by another bill, and bills per **BOQ item** at the
 * item's current rate when drafted or refreshed. The client side may be
 * measured past the BOQ quantity (a deviation, ADR §4): nothing is
 * refused, the line is marked instead.
 *
 * It is a **tax invoice**: the place of supply is the Project's state
 * (works on immovable property), the supplier GSTIN the Company's billing
 * address in that state (else its default one, with the
 * `GSTIN_NOT_IN_STATE` warning), the recipient GSTIN the Client's; CGST +
 * SGST when the supplier's state is the place of supply, else IGST.
 * Reverse charge never applies to works contracts billed to a client.
 *
 * Approval creates the receivable invoice to the Client in finance; the
 * retention the Client holds back is **retention receivable**, derived in
 * contracts from approved bills like a Contractor's retention held.
 * "Final" marks the contract's final bill: it prints so and nothing closes.
 */

export const CLIENT_BILL_NAMING: DocumentNaming = {
  code: "BILL",
  label: "Client Bill",
};

/**
 * What a Client holds back from a bill in CM-1107: retention, recovery of
 * its mobilisation advance (manual until CM-1108), material it issued at
 * cost, and other (with a reason).
 */
export const CLIENT_BILL_DEDUCTION_KINDS = [
  "retention",
  "mobilisation_recovery",
  "material_at_cost",
  "other",
] as const satisfies readonly DeductionKind[];
export type ClientBillDeductionKind =
  (typeof CLIENT_BILL_DEDUCTION_KINDS)[number];
export type ClientBillDeduction = RaBillDeduction<ClientBillDeductionKind>;

/** The bill date is not after today; "measured up to" not after the bill date. */
export function clientBillHeader(
  input: BillHeaderInput,
  context: { today: CalendarDate },
): BillHeader {
  return raBillHeader(input, { today: context.today });
}

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export type ClientBillLineInput = {
  boqItemId: string;
  itemNo: string | null;
  description: string;
  uomId: string;
  /** Paise per UoM: the BOQ item's current rate. */
  rate: bigint;
  /** The BOQ item's current quantity; null when the item was removed. */
  boqQuantity: bigint | null;
  /** Σ the item on earlier approved client bills. */
  previousQuantity: bigint;
  /** Σ this bill's rows on the item. */
  quantity: bigint;
};

export type ClientBillLineFigures = ClientBillLineInput & LineFigures;

/** One line of the abstract: cumulative − previous at the BOQ rate. */
export function clientBillLine(
  input: ClientBillLineInput,
): ClientBillLineFigures {
  return { ...input, ...lineFigures(input) };
}

export type LineDeviation = {
  /** Cumulative is above the BOQ item's current quantity. */
  over: boolean;
  /** Cumulative − BOQ quantity, when over. */
  overBy: bigint | null;
  /** How far over, hundredths of a percent; null without a BOQ quantity. */
  percentOver: bigint | null;
  /** Beyond the Company's deviation limit: the item needs a Variation. */
  overLimit: boolean;
};

/**
 * Deviation on a line (ADR CM-0023 §4): billing past the BOQ quantity is
 * allowed on the client side and shown, with how far over it is and
 * whether it passes the Company's deviation limit.
 */
export function lineDeviation(
  line: { cumulativeQuantity: bigint; boqQuantity: bigint | null },
  limit: bigint,
): LineDeviation {
  const planned = line.boqQuantity ?? 0n;
  const over = line.cumulativeQuantity > planned;
  return {
    over,
    overBy: over ? line.cumulativeQuantity - planned : null,
    percentOver: over ? percentOver(line.cumulativeQuantity, planned) : null,
    overLimit: over && isDeviation(line.cumulativeQuantity, planned, limit),
  };
}

// ---------------------------------------------------------------------------
// Retention and deductions
// ---------------------------------------------------------------------------

/**
 * Retention the Client holds (ADR CM-0023 §7): gross × the client
 * contract's retention %, cut so the retention on the Project's approved
 * client bills never passes cap % × the BOQ's current value.
 */
export function clientRetentionSuggestion(input: {
  gross: bigint;
  retentionPercent: bigint;
  retentionCapPercent: bigint | null;
  boqValue: bigint;
  heldBefore: bigint;
}): RetentionSuggestion {
  return raRetentionSuggestion({ ...input, contractValue: input.boqValue });
}

export function clientBillDeductions(
  inputs: readonly BillDeductionInput[],
): ClientBillDeduction[] {
  return raBillDeductions(
    inputs,
    CLIENT_BILL_DEDUCTION_KINDS,
    "Pick retention, mobilisation advance recovery, material issued at cost or other.",
  );
}

export function assertClientDeductions(input: {
  deductions: readonly { kind: string; amount: bigint }[];
  gross: bigint;
  payableGst: bigint;
  retentionMax: bigint;
}): void {
  assertRaDeductions({ ...input, contract: "client contract" });
}

// ---------------------------------------------------------------------------
// GST: a tax invoice
// ---------------------------------------------------------------------------

/** A Company billing address as the tax invoice prints it. */
export type CompanyGstin = {
  id: string;
  name: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  isDefault: boolean;
};

export const GSTIN_NOT_IN_STATE = "GSTIN_NOT_IN_STATE" as const;

export type SupplierChoice = {
  /** The billing address the invoice prints, or null when there is none. */
  address: CompanyGstin | null;
  gstin: string | null;
  /** The supplier's GST state: the GSTIN's first two digits, else the address's. */
  stateCode: string | null;
  /** `GSTIN_NOT_IN_STATE` when the Company has no GSTIN in the Project's state. */
  warning: typeof GSTIN_NOT_IN_STATE | null;
};

/**
 * The Company's GSTIN for a Project (ADR CM-0023 §11): its billing address
 * in the Project's state that has a GSTIN, else the default billing
 * address (else the first). When no address in the Project's state has a
 * GSTIN the bill warns `GSTIN_NOT_IN_STATE` — the Company may need to
 * register there — but is not refused.
 */
export function supplierForProject(
  addresses: readonly CompanyGstin[],
  projectStateCode: string,
): SupplierChoice {
  const inState = addresses.find(
    (row) =>
      row.gstin != null &&
      (row.gstin.slice(0, 2) === projectStateCode ||
        row.stateCode === projectStateCode),
  );
  const address =
    inState ?? addresses.find((row) => row.isDefault) ?? addresses[0] ?? null;
  const gstin = address?.gstin ?? null;
  return {
    address,
    gstin,
    stateCode: gstin?.slice(0, 2) ?? address?.stateCode ?? null,
    warning: inState == null ? GSTIN_NOT_IN_STATE : null,
  };
}

/** What the bill page and PDF say for `GSTIN_NOT_IN_STATE`. */
export function gstinNotInStateMessage(projectStateCode: string): string {
  const state = gstStateName(projectStateCode) ?? projectStateCode;
  return `The Company has no GSTIN in ${state} (${projectStateCode}), where this work is supplied. Check whether the Company must register there; this invoice shows the default GSTIN.`;
}

/**
 * GST on a Client Bill: at the client contract's rate, CGST + SGST when the
 * supplier GSTIN's state is the place of supply (the Project's state),
 * else IGST. Never reverse charge: works contracts billed to a client are
 * taxed forward.
 */
export function clientBillGst(input: {
  gross: bigint;
  gstRate: bigint | null;
  supplierStateCode: string | null;
  placeOfSupplyStateCode: string;
}): BillGst {
  return billGst({
    gross: input.gross,
    gstRate: input.gstRate,
    reverseCharge: false,
    supplierStateCode: input.supplierStateCode,
    placeOfSupplyStateCode: input.placeOfSupplyStateCode,
  });
}

// ---------------------------------------------------------------------------
// Client contract terms (one per Project)
// ---------------------------------------------------------------------------

export type ClientContractTermsInput = Pick<
  WorkOrderTermsInput,
  | "retentionPercent"
  | "retentionCapPercent"
  | "retentionCompletionPercent"
  | "dlpMonths"
  | "sacCode"
  | "gstRate"
> & { handoverOn?: string | null };

export type ClientContractTerms = {
  /** Hundredths of a percent of each bill. */
  retentionPercent: bigint;
  /** Hundredths of a percent of the BOQ's value; null = no cap. */
  retentionCapPercent: bigint | null;
  /** Hundredths of a percent released at completion; the rest at the DLP end. */
  retentionCompletionPercent: bigint;
  dlpMonths: number | null;
  /** The Project's handover: the client side's DLP starts here (CM-1108). */
  handoverOn: CalendarDate | null;
  sacCode: string | null;
  /** Hundredths of a percent; null: no GST. */
  gstRate: bigint | null;
};

/** No row yet: no retention, 50 % at completion, no GST until set. */
export const DEFAULT_CLIENT_CONTRACT_TERMS: ClientContractTerms = {
  retentionPercent: 0n,
  retentionCapPercent: null,
  retentionCompletionPercent: 5000n,
  dlpMonths: null,
  handoverOn: null,
  sacCode: null,
  gstRate: null,
};

/**
 * Checks the client contract's terms with the Work Order's rules
 * (percentages 0–100 with two places, GST 0–28 %, SAC 4–8 digits, DLP
 * 0–120 months; errors name `terms.*`), plus the handover date.
 */
export function clientContractTerms(
  input: ClientContractTermsInput,
): ClientContractTerms {
  const terms = workOrderTerms(
    {
      retentionPercent: input.retentionPercent,
      retentionCapPercent: input.retentionCapPercent,
      retentionCompletionPercent: input.retentionCompletionPercent,
      dlpMonths: input.dlpMonths,
      sacCode: input.sacCode,
      gstRate: input.gstRate,
      tdsNature: null,
      reverseCharge: false,
    },
    null,
  );
  const raw = input.handoverOn?.trim() ?? "";
  return {
    retentionPercent: terms.retentionPercent,
    retentionCapPercent: terms.retentionCapPercent,
    retentionCompletionPercent: terms.retentionCompletionPercent,
    dlpMonths: terms.dlpMonths,
    handoverOn:
      raw === ""
        ? null
        : (() => {
            try {
              return assertCalendarDate(raw, "HANDOVER_ON_INVALID");
            } catch {
              throw new DomainError(
                "HANDOVER_ON_INVALID",
                "Enter the handover date as a date.",
                { details: { field: "terms.handoverOn" } },
              );
            }
          })(),
    sacCode: terms.sacCode,
    gstRate: terms.gstRate,
  };
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const clientBillNotFound = () =>
  notFound("BILL_NOT_FOUND", "This Client Bill was not found.");

/** Client Bills are for Contract work Projects only. */
export const projectNotContractWork = () =>
  new DomainError(
    "PROJECT_NOT_CONTRACT_WORK",
    "This Project is Own development: its BOQ is a budget and is never billed. Change the Project's role to Contract work to bill a Client.",
    { details: { field: "projectId" } },
  );

export const projectClientRequired = () =>
  new DomainError(
    "PROJECT_CLIENT_REQUIRED",
    "Pick the Project's Client on the Project first: the bill is a tax invoice to that Client.",
    { details: { field: "projectId" } },
  );

export const projectStateRequired = () =>
  new DomainError(
    "PROJECT_STATE_REQUIRED",
    "Set the Project's state on the Project first: it is the place of supply on the tax invoice.",
    { details: { field: "projectId" } },
  );

/** The partial unique index: one draft or pending running client bill per Project. */
export const clientBillOpenExists = () =>
  conflict(
    "BILL_OPEN_EXISTS",
    "This Project already has a Client Bill in draft or waiting for approval. Finish that one first.",
  );

export const clientBillNumberTaken = () =>
  conflict(
    "BILL_NUMBER_TAKEN",
    "Another bill already has this number. Check the Client Bill sequence rule.",
  );

export const clientBillNoMeasurements = () =>
  new DomainError(
    "BILL_NO_MEASUREMENTS",
    "No checked client-side measurements of this Project up to that date are waiting to be billed.",
    { details: { field: "measuredUpTo" } },
  );

export const clientBillNotLatest = () =>
  conflict(
    "BILL_NOT_LATEST",
    "Only the latest Client Bill on the Project can be reversed, and only while no later bill is open. Reverse or delete the later ones first.",
  );

export const clientBillSettled = () =>
  conflict(
    "BILL_SETTLED",
    "This bill's invoice has receipts or a write-off against it, so it cannot be reversed. Cancel them in finance first.",
  );

export const clientBillInvoiceNumberTaken = (number: string) =>
  conflict(
    "BILL_INVOICE_NUMBER_TAKEN",
    `The Client already has an invoice numbered ${number} in finance. Give this Project's Client Bill rule a project token.`,
    { number },
  );

export const clientContractChanged = () =>
  conflict(
    "CLIENT_CONTRACT_CHANGED",
    "Someone changed the client contract terms after you opened them. Reload to see the latest.",
  );
