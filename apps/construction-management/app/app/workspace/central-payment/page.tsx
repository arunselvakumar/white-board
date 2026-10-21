import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { CentralPaymentPage } from "@/components/finance/central-payment/central-payment-page";
import { CentralPaymentSkeleton } from "@/components/finance/central-payment/central-payment-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Central Payment" };

/**
 * Workspace → Central Payment (CM-709): party dues across Projects,
 * account balances, petty cash and the central finance reports.
 */
export default async function CentralPaymentRoute() {
  if (!(await viewerCan("finance.central_payment", "read")))
    return <ProjectNoAccess what="Central Payment" />;
  return (
    <QuerySuspense fallback={<CentralPaymentSkeleton />}>
      <CentralPaymentPage />
    </QuerySuspense>
  );
}
