import type { Metadata } from "next";

import { FamilyReceiptScreen } from "@/app/(app)/preschool/family/receipts/[id]/_components/family-receipt-screen";

export const metadata: Metadata = { title: "Receipt" };

export default async function FamilyReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ child?: string }>;
}) {
  const [{ id }, { child }] = await Promise.all([params, searchParams]);
  return (
    <FamilyReceiptScreen
      paymentId={id}
      childQuery={child == null ? "" : `?child=${encodeURIComponent(child)}`}
    />
  );
}
