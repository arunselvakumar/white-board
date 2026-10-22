import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ContractorBillsList } from "@/components/contracts/contractor-bills/contractor-bills-list";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Contractor Bills" };

/** The Project's Contractor Bills (CM-1106, ADR CM-0023 §7). `?workOrderId=` opens one Work Order's. */
export default async function ContractorBillsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ workOrderId?: string | string[] }>;
}) {
  const { id } = await params;
  const { workOrderId } = await searchParams;
  if (
    !(await viewerCan("contracts.contractor_bills", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="Contractor Bills" />;
  const canCreate = await viewerCan("contracts.contractor_bills", "create", {
    projectId: id,
  });
  return (
    <ContractorBillsList
      projectId={id}
      canCreate={canCreate}
      workOrderId={typeof workOrderId === "string" ? workOrderId : ""}
    />
  );
}
