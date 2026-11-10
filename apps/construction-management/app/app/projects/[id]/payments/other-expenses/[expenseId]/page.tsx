import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { OtherExpenseDetail } from "@/app/app/projects/[id]/payments/other-expenses/[expenseId]/_components/other-expense-detail";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Other Expense" };

export default async function OtherExpensePage({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  if (!(await viewerCan("finance.other_expenses", "read", { projectId: id })))
    return <ProjectNoAccess what="Other Expenses" />;
  return <OtherExpenseDetail projectId={id} id={expenseId} />;
}
