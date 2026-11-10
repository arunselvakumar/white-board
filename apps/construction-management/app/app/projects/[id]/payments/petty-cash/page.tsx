import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { PettyCashScreen } from "@/app/app/projects/[id]/payments/petty-cash/_components/petty-cash-screen";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Petty Cash" };

/** Petty Cash of a Project: accounts, vouchers, approval. */
export default async function ProjectPettyCashPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("finance.petty_cash", "read", { projectId: id })))
    return <ProjectNoAccess what="Petty Cash" />;
  return <PettyCashScreen projectId={id} />;
}
