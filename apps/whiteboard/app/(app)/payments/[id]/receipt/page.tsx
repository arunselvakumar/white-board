import type { Metadata } from "next";

import { ReceiptScreen } from "@/components/enrollments/receipt-screen";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReceiptScreen paymentId={id} />;
}
