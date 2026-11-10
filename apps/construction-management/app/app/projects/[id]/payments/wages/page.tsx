import type { Metadata } from "next";

import { PaymentsPage } from "@/app/app/projects/[id]/payments/wages/_components/payments-page";

export const metadata: Metadata = { title: "Labour & Vendor payments" };

/** Wage payments and balances, a tab of Payments. */
export default async function ProjectWagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentsPage projectId={id} />;
}
