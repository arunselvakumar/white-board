import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { VoucherEdit } from "@/components/finance/petty-cash/petty-cash-pages";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Edit voucher" };

export default async function VoucherEditRoute({
  params,
}: {
  params: Promise<{ id: string; voucherId: string }>;
}) {
  const { id, voucherId } = await params;
  if (!(await viewerCan("finance.petty_cash", "update", { projectId: id })))
    return <ProjectNoAccess what="editing petty-cash vouchers" />;
  return <VoucherEdit projectId={id} voucherId={voucherId} />;
}
