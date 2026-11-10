import type { Metadata } from "next";

import { PaymentsPage } from "@/app/app/projects/[id]/payments/wages/_components/payments-page";

export const metadata: Metadata = { title: "Labour & Vendor payments" };

/** M2's wage payments and balances (CM-216), a tab of Payments since M7. */
export default async function ProjectWagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentsPage projectId={id} />;
}
