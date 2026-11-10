import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { VoucherDetail } from "@/app/app/projects/[id]/payments/petty-cash/[voucherId]/_components/voucher-detail";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Petty-cash voucher" };

/** One petty-cash voucher with its files and remarks. */
export default async function VoucherRoute({
  params,
}: {
  params: Promise<{ id: string; voucherId: string }>;
}) {
  const { id, voucherId } = await params;
  if (!(await viewerCan("finance.petty_cash", "read", { projectId: id })))
    return <ProjectNoAccess what="Petty Cash" />;
  return <VoucherDetail projectId={id} voucherId={voucherId} />;
}
