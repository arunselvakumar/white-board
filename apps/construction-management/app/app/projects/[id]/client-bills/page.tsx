import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ClientBillsList } from "@/components/contracts/client-bills/client-bills-list";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Client Bills" };

/** The Project's Client Bills and client contract terms (CM-1107, ADR CM-0023 §7). */
export default async function ClientBillsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("contracts.client_bills", "read", { projectId: id })))
    return <ProjectNoAccess what="Client Bills" />;
  const canCreate = await viewerCan("contracts.client_bills", "create", {
    projectId: id,
  });
  return <ClientBillsList projectId={id} canCreate={canCreate} />;
}
