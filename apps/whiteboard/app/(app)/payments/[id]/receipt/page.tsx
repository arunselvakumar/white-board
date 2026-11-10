import type { Metadata } from "next";

import { ReceiptScreen } from "@/app/(app)/payments/[id]/receipt/_components/receipt-screen";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiptScreen paymentId={id} />;
}
