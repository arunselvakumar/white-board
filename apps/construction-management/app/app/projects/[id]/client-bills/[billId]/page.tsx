import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ClientBillDetail } from "@/components/contracts/client-bills/client-bill-detail";
import { ClientBillDetailSkeleton } from "@/components/contracts/client-bills/client-bills-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Client Bill" };

/** One Client Bill (CM-1107); approval notices and finance invoices link here. */
export default async function ClientBillPage({
  params,
}: {
  params: Promise<{ id: string; billId: string }>;
}) {
  const { id, billId } = await params;
  if (!(await viewerCan("contracts.client_bills", "read", { projectId: id })))
    return <ProjectNoAccess what="Client Bills" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<ClientBillDetailSkeleton projectId={id} />}>
        <ClientBillDetail projectId={id} id={billId} />
      </QuerySuspense>
    </div>
  );
}
