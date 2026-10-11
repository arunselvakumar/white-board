import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { TransactionsPage } from "@/components/finance/transactions/transactions-page";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Transactions" };

/** A Project's Transactions and transfers (CM-702). */
export default async function ProjectTransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("finance.transactions", "read", { projectId: id })))
    return <ProjectNoAccess what="Transactions" />;
  return <TransactionsPage projectId={id} />;
}
