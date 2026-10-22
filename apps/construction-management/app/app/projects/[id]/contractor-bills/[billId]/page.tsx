import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ContractorBillDetail } from "@/components/contracts/contractor-bills/contractor-bill-detail";
import { ContractorBillDetailSkeleton } from "@/components/contracts/contractor-bills/contractor-bills-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Contractor Bill" };

/** One Contractor Bill (CM-1106); approval notices and finance invoices link here. */
export default async function ContractorBillPage({
  params,
}: {
  params: Promise<{ id: string; billId: string }>;
}) {
  const { id, billId } = await params;
  if (
    !(await viewerCan("contracts.contractor_bills", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="Contractor Bills" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<ContractorBillDetailSkeleton projectId={id} />}>
        <ContractorBillDetail projectId={id} id={billId} />
      </QuerySuspense>
    </div>
  );
}
