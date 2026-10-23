import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { EscalationBillDetail } from "@/components/contracts/escalation/escalation-bill-detail";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Escalation Bill" };

/** One escalation bill (CM-1109); approval notices and finance invoices link here. */
export default async function EscalationBillPage({
  params,
}: {
  params: Promise<{ id: string; billId: string }>;
}) {
  const { id, billId } = await params;
  if (!(await viewerCan("contracts.client_bills", "read", { projectId: id })))
    return <ProjectNoAccess what="Client Bills" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<div className="min-h-40" />}>
        <EscalationBillDetail projectId={id} id={billId} />
      </QuerySuspense>
    </div>
  );
}
