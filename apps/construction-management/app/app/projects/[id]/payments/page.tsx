import type { Metadata } from "next";

import { PaymentsPage } from "@/components/payments/payments-page";

export const metadata: Metadata = { title: "Payments" };

export default async function ProjectPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-6xl p-6">
      <PaymentsPage projectId={id} />
    </div>
  );
}
