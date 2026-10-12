import type { Metadata } from "next";

import { PaymentsIndex } from "@/components/finance/payments-hub/payments-index";

export const metadata: Metadata = { title: "Payments" };

/** The Payments module opens on the first tab the viewer may read. */
export default async function ProjectPaymentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentsIndex projectId={id} />;
}
