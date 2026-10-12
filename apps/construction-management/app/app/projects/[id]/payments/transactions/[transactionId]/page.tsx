import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { TransactionDetail } from "@/components/finance/transactions/transaction-detail";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Transaction" };

/** One Transaction (CM-702). */
export default async function ProjectTransactionPage({
  params,
}: {
  params: Promise<{ id: string; transactionId: string }>;
}) {
  const { id, transactionId } = await params;
  if (!(await viewerCan("finance.transactions", "read", { projectId: id })))
    return <ProjectNoAccess what="Transactions" />;
  return (
    <TransactionDetail
      projectId={id}
      document="transaction"
      id={transactionId}
    />
  );
}
