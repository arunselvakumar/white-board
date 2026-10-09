import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type { PaymentPartyType } from "@/src/queries/balances";
import type { RecordWagePaymentInput } from "@/src/queries/payments";

export const payFormSchema = z
  .object({
    paymentDate: z.string().min(1, "Enter the payment date"),
    kind: z.enum(["payment", "advance"]),
    mode: z.enum(["cash", "bank"]),
    reference: z.string().trim().max(100, "Use at most 100 characters"),
    /** Rupees as typed. */
    amount: z.string(),
    paidByMemberId: z.string(),
    remarks: z.string().trim().max(500, "Use at most 500 characters"),
  })
  .superRefine((values, ctx) => {
    const paise = rupeesToPaise(values.amount);
    if (!isRupees(values.amount) || paise == null || paise <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter an amount more than zero",
      });
    // The API takes Bank without a reference; the screen asks for it.
    if (values.mode === "bank" && values.reference.trim() === "")
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter the cheque or transaction number",
      });
  });

export type PayFormValues = z.infer<typeof payFormSchema>;

/**
 * The form's starting values: today, a payment in cash, and the Final
 * Amount when something is owed (null without Financial: left empty).
 */
export function payFormDefaults(input: {
  today: string;
  finalAmount: number | null;
  currentMemberId: string | null;
}): PayFormValues {
  return {
    paymentDate: input.today,
    kind: "payment",
    mode: "cash",
    reference: "",
    amount:
      input.finalAmount != null && input.finalAmount > 0
        ? paiseToRupees(input.finalAmount)
        : "",
    paidByMemberId: input.currentMemberId ?? "",
    remarks: "",
  };
}

export function toRecordInput(
  values: PayFormValues,
  target: { projectId: string; partyType: PaymentPartyType; partyId: string },
): RecordWagePaymentInput {
  const reference = values.reference.trim();
  const remarks = values.remarks.trim();
  return {
    partyType: target.partyType,
    partyId: target.partyId,
    projectId: target.projectId,
    paymentDate: values.paymentDate,
    kind: values.kind,
    mode: values.mode,
    amount: rupeesToPaise(values.amount) ?? 0,
    reference: reference === "" ? null : reference,
    paidByMemberId: values.paidByMemberId === "" ? null : values.paidByMemberId,
    remarks: remarks === "" ? null : remarks,
  };
}
