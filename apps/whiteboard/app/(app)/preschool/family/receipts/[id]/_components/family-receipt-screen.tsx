"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { FeeReceiptView } from "@/app/(app)/preschool/fees/receipts/[id]/_components/fee-receipt-screen";
import { receiptQueryOptions } from "@/src/queries/preschool/fees";

/** The same printable Receipt staff see, with the way back to the family's fees. */
export function FamilyReceiptScreen({
  paymentId,
  childQuery,
}: {
  paymentId: string;
  /** `?child=<id>` to come back to the same Child. */
  childQuery: string;
}) {
  const { data } = useSuspenseQuery(receiptQueryOptions(paymentId));
  return (
    <FeeReceiptView
      receipt={data}
      back={{ href: `/preschool/family/fees${childQuery}`, label: "Fees" }}
      share={false}
    />
  );
}
