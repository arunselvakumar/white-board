import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { OtherExpensesList } from "@/app/app/projects/[id]/payments/other-expenses/_components/other-expenses-list";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Other Expenses" };

export default async function ProjectOtherExpensesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("finance.other_expenses", "read", { projectId: id })))
    return <ProjectNoAccess what="Other Expenses" />;
  return <OtherExpensesList projectId={id} />;
}
