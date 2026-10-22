import { z } from "zod";

import { isRecoveryKind } from "@/components/contracts/advances/bill-recoveries";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  CLIENT_BILL_DEDUCTION_KINDS,
  type ClientBillDeductionKind,
} from "@/src/contracts/domain/client-bill";
import {
  DEDUCTION_KIND_LABELS,
  type DeductionKind,
} from "@/src/contracts/domain/contract-terms";
import {
  BILL_DEDUCTION_DESCRIPTION_MAX,
  BILL_DEDUCTIONS_MAX,
  BILL_REMARKS_MAX,
} from "@/src/contracts/domain/ra-bill";
import type {
  ClientBill,
  ClientBillUpdate,
} from "@/src/queries/contracts-client-bills";

export { deductionsPaise } from "../contractor-bills/contractor-bill-form-schema";

/** What the Client may hold back from a bill, with the labels. */
export const CLIENT_DEDUCTION_OPTIONS = CLIENT_BILL_DEDUCTION_KINDS.map(
  (kind) => ({ value: kind, label: DEDUCTION_KIND_LABELS[kind] }),
);

const DeductionSchema = z
  .object({
    kind: z.enum(CLIENT_BILL_DEDUCTION_KINDS),
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
  );

export const ClientBillEditorSchema = z
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

export type ClientBillEditorValues = z.infer<typeof ClientBillEditorSchema>;

function editable(kind: DeductionKind): kind is ClientBillDeductionKind {
  return (CLIENT_BILL_DEDUCTION_KINDS as readonly string[]).includes(kind);
}

/** The editor's values for a draft as loaded. */
export function clientEditorValuesOf(bill: ClientBill): ClientBillEditorValues {
  return {
    billDate: bill.billDate,
    measuredUpTo: bill.measuredUpTo,
    isFinal: bill.isFinal,
    remarks: bill.remarks ?? "",
    deductions: bill.deductionLines
      .filter((deduction) => editable(deduction.kind))
      .map((deduction) => ({
        kind: deduction.kind as ClientBillDeductionKind,
        amount: paiseToRupees(deduction.amount),
        description: deduction.description ?? "",
        advanceId: deduction.advanceId ?? "",
      })),
  };
}

/** The update request: deductions only with Financial (the server ignores them otherwise). */
export function toClientUpdate(
  values: ClientBillEditorValues,
  bill: Pick<ClientBill, "updatedAt" | "financial">,
): ClientBillUpdate {
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
          })),
        }
      : {}),
    expectedUpdatedAt: bill.updatedAt,
  };
}
