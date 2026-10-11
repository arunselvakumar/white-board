import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { OtherExpenseNew } from "@/components/finance/other-expenses/other-expense-pages";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Add Other Expense" };

/** Record an Other Expense (CM-704). */
export default async function NewOtherExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("finance.other_expenses", "create", { projectId: id })))
    return <ProjectNoAccess what="recording Other Expenses" />;
  return <OtherExpenseNew projectId={id} />;
}
