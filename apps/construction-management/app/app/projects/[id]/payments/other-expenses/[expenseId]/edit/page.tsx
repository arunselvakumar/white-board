import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { OtherExpenseEdit } from "@/components/finance/other-expenses/other-expense-pages";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Edit Other Expense" };

/** Edit an Other Expense (CM-704). */
export default async function EditOtherExpensePage({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  if (!(await viewerCan("finance.other_expenses", "update", { projectId: id })))
    return <ProjectNoAccess what="editing Other Expenses" />;
  return <OtherExpenseEdit projectId={id} id={expenseId} />;
}
