import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { TransactionDetail } from "@/app/app/projects/[id]/payments/transactions/_components/transaction-detail";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Transaction" };

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
