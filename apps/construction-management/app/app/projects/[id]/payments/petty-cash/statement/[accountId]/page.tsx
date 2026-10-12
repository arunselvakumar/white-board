import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { AccountStatementView } from "@/components/finance/petty-cash/account-statement";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Petty-cash statement" };

/** A petty-cash account's statement for a period (CM-703). */
export default async function PettyCashStatementRoute({
  params,
}: {
  params: Promise<{ id: string; accountId: string }>;
}) {
  const { id, accountId } = await params;
  if (!(await viewerCan("finance.petty_cash", "read", { projectId: id })))
    return <ProjectNoAccess what="Petty Cash" />;
  return <AccountStatementView projectId={id} accountId={accountId} />;
}
