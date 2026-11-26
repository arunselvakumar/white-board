import type { Metadata } from "next";

import { FeeReceiptScreen } from "@/app/(app)/preschool/fees/receipts/[id]/_components/fee-receipt-screen";

export const metadata: Metadata = { title: "Receipt" };

export default async function FeeReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FeeReceiptScreen paymentId={id} />;
}
