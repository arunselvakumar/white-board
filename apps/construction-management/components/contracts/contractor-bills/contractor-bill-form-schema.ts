import { z } from "zod";

import { isRecoveryKind } from "@/components/contracts/advances/bill-recoveries";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  DEDUCTION_KIND_LABELS,
  type DeductionKind,
} from "@/src/contracts/domain/contract-terms";
import {
  BILL_DEDUCTION_DESCRIPTION_MAX,
  BILL_DEDUCTIONS_MAX,
  BILL_REMARKS_MAX,
  CONTRACTOR_BILL_DEDUCTION_KINDS,
  type ContractorBillDeductionKind,
} from "@/src/contracts/domain/contractor-bill";
import type {
  ContractorBill,
  ContractorBillUpdate,
} from "@/src/queries/contracts-contractor-bills";

/** The deduction kinds a Contractor Bill takes, with their labels. */
export const DEDUCTION_OPTIONS = CONTRACTOR_BILL_DEDUCTION_KINDS.map(
  (kind) => ({ value: kind, label: DEDUCTION_KIND_LABELS[kind] }),
);

const DeductionSchema = z
  .object({
    kind: z.enum(CONTRACTOR_BILL_DEDUCTION_KINDS),
    amount: z
      .string()
      .refine((value) => isRupees(value) && (rupeesToPaise(value) ?? 0) > 0, {
        message: "Enter an amount of more than ₹0.",
      }),
    description: z.string().max(BILL_DEDUCTION_DESCRIPTION_MAX, {
      message: `Use at most ${String(BILL_DEDUCTION_DESCRIPTION_MAX)} characters.`,
    }),
    /** A recovery's advance (CM-1108); "" for other kinds. */
    advanceId: z.string(),
    /** The negative escalation bill an "other" deduction recovers (CM-1109); "" for none. */
    escalationBillId: z.string(),
    /** The Material a material deduction recovers (CM-1110); "" for none. */
    materialId: z.string(),
  })
  .refine(
    (deduction) =>
      deduction.kind !== "other" || deduction.description.trim() !== "",
    { message: "Write what it is for.", path: ["description"] },
  )
  .refine(
    (deduction) =>
      !isRecoveryKind(deduction.kind) || deduction.advanceId !== "",
    { message: "Pick the advance this recovers.", path: ["advanceId"] },
  )
  .refine(
    (deduction) =>
      deduction.kind !== "material_reconciliation" ||
      deduction.materialId !== "",
    { message: "Pick the material this recovers.", path: ["materialId"] },
  );

export const ContractorBillEditorSchema = z
  .object({
    billDate: z.string().min(1, "Pick the bill date."),
    measuredUpTo: z.string().min(1, "Pick the date measured up to."),
    isFinal: z.boolean(),
    remarks: z.string().max(BILL_REMARKS_MAX, {
      message: `Use at most ${BILL_REMARKS_MAX.toLocaleString("en-IN")} characters.`,
    }),
    deductions: z.array(DeductionSchema).max(BILL_DEDUCTIONS_MAX),
  })
  .refine((values) => values.measuredUpTo <= values.billDate, {
    message: "Bill measurements up to the bill date at the latest.",
    path: ["measuredUpTo"],
  });

export type ContractorBillEditorValues = z.infer<
  typeof ContractorBillEditorSchema
>;

function editable(kind: DeductionKind): kind is ContractorBillDeductionKind {
  return (CONTRACTOR_BILL_DEDUCTION_KINDS as readonly string[]).includes(kind);
}

/** The editor's values for a draft as loaded. */
export function editorValuesOf(
  bill: ContractorBill,
): ContractorBillEditorValues {
  return {
    billDate: bill.billDate,
    measuredUpTo: bill.measuredUpTo,
    isFinal: bill.isFinal,
    remarks: bill.remarks ?? "",
    deductions: bill.deductionLines
      .filter((deduction) => editable(deduction.kind))
      .map((deduction) => ({
        kind: deduction.kind as ContractorBillDeductionKind,
        amount: paiseToRupees(deduction.amount),
        description: deduction.description ?? "",
        advanceId: deduction.advanceId ?? "",
        escalationBillId: deduction.escalationBillId ?? "",
        materialId: deduction.materialId ?? "",
      })),
  };
}

/** The update request: deductions only with Financial (the server ignores them otherwise). */
export function toUpdate(
  values: ContractorBillEditorValues,
  bill: Pick<ContractorBill, "updatedAt" | "financial">,
): ContractorBillUpdate {
  return {
    billDate: values.billDate,
    measuredUpTo: values.measuredUpTo,
    isFinal: values.isFinal,
    remarks: values.remarks.trim() === "" ? null : values.remarks,
    ...(bill.financial
      ? {
          deductions: values.deductions.map((deduction) => ({
            kind: deduction.kind,
            amount: rupeesToPaise(deduction.amount) ?? 0,
            description:
              deduction.description.trim() === ""
                ? null
                : deduction.description.trim(),
            advanceId: isRecoveryKind(deduction.kind)
              ? deduction.advanceId
              : null,
            escalationBillId:
              deduction.kind === "other" && deduction.escalationBillId !== ""
                ? deduction.escalationBillId
                : null,
            materialId:
              (deduction.kind === "material_reconciliation" ||
                deduction.kind === "material_at_cost") &&
              deduction.materialId !== ""
                ? deduction.materialId
                : null,
          })),
        }
      : {}),
    expectedUpdatedAt: bill.updatedAt,
  };
}

/** Σ deductions typed, in paise (NaN rows count 0). */
export function deductionsPaise(
  deductions: readonly { amount: string }[],
): number {
  return deductions.reduce((sum, deduction) => {
    const paise = rupeesToPaise(deduction.amount);
    return sum + (paise == null || Number.isNaN(paise) ? 0 : paise);
  }, 0);
}
