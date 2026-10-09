import { z } from "zod";

import type { WagePaymentReadModel } from "@/src/labour/application/wage-payment-handlers";

export const PAYMENTS_PATH = "/api/construction/labour/payments";

const partyType = z.enum(["labour", "vendor"]);
const kind = z.enum(["payment", "advance"]);
const mode = z.enum(["cash", "bank"]);

// Requests

export const RecordConstructionLabourWagePaymentRequestModel = z.object({
  partyType,
  /** A labourer or vendor of the Active Company. */
  partyId: z.uuid(),
  /** A live Project; a vendor must be assigned to it. */
  projectId: z.uuid(),
  /** `YYYY-MM-DD`, not after today. */
  paymentDate: z.iso.date(),
  /** `payment` against wages earned, `advance` ahead of them. */
  kind,
  mode,
  /** Paise, > 0. */
  amount: z.int(),
  /** Cheque or transaction number; optional even for Bank (the screen asks for it). */
  reference: z.string().max(200).nullable().optional(),
  /** The Team Member who handed over the money. */
  paidByMemberId: z.uuid().nullable().optional(),
  remarks: z.string().max(1000).nullable().optional(),
});

export type RecordConstructionLabourWagePaymentRequestModel = z.infer<
  typeof RecordConstructionLabourWagePaymentRequestModel
>;

export const ListConstructionLabourWagePaymentsRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Leave out for both types the caller may read. */
    partyType: partyType.optional(),
    partyId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    kind: kind.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ConstructionLabourWagePaymentParamsModel = z.object({
  id: z.uuid(),
});

export const CancelConstructionLabourWagePaymentRequestModel = z.object({
  /** The payment's `updatedAt` as last seen; 409 `PAYMENT_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const ListConstructionLabourPaymentPayersRequestModel = z.object({
  projectId: z.uuid(),
  partyType,
});

// Responses (amounts are paise; null without the menu's Financial flag)

export const ConstructionLabourWagePaymentResponseModel = z.object({
  id: z.uuid(),
  partyType,
  partyId: z.uuid(),
  partyName: z.string(),
  projectId: z.uuid(),
  projectName: z.string().nullable(),
  paymentDate: z.iso.date(),
  kind,
  mode,
  reference: z.string().nullable(),
  /** Paise; null without Financial. */
  amount: z.int().nullable(),
  paidBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  remarks: z.string().nullable(),
  /** Streams the receipt (PDF or image); null without one. */
  receiptUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt` to cancel. */
  updatedAt: z.iso.datetime(),
});

export type ConstructionLabourWagePaymentResponseModel = z.infer<
  typeof ConstructionLabourWagePaymentResponseModel
>;

export const ListConstructionLabourWagePaymentsResponseModel = z.object({
  items: z.array(ConstructionLabourWagePaymentResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  /** Paise: every payment matching the filters; null unless Financial covers every type listed. */
  totalAmount: z.int().nullable(),
});

export type ListConstructionLabourWagePaymentsResponseModel = z.infer<
  typeof ListConstructionLabourWagePaymentsResponseModel
>;

export const ListConstructionLabourPaymentPayersResponseModel = z.object({
  /** Active Team Members by name. */
  items: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** The caller's own Team Member, the "Paid by" default. */
  currentMemberId: z.uuid().nullable(),
});

export type ListConstructionLabourPaymentPayersResponseModel = z.infer<
  typeof ListConstructionLabourPaymentPayersResponseModel
>;

export function receiptUrl(id: string, version: string | null): string | null {
  return version == null
    ? null
    : `${PAYMENTS_PATH}/${id}/receipt?v=${encodeURIComponent(version)}`;
}

export function toWagePaymentResponse(
  payment: WagePaymentReadModel,
  financial: boolean,
): ConstructionLabourWagePaymentResponseModel {
  return {
    id: payment.id,
    partyType: payment.partyType,
    partyId: payment.partyId,
    partyName: payment.partyName,
    projectId: payment.projectId,
    projectName: payment.projectName,
    paymentDate: payment.paymentDate,
    kind: payment.kind,
    mode: payment.mode,
    reference: payment.reference,
    amount: financial ? payment.amount : null,
    paidBy: payment.paidBy,
    remarks: payment.remarks,
    receiptUrl: receiptUrl(payment.id, payment.receiptVersion),
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}
