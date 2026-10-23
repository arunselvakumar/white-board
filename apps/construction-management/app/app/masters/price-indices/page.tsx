import type { Metadata } from "next";

import { PriceIndicesPage } from "@/components/contracts/escalation/price-indices-page";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Price indices" };

/** Master records → Price indices (CM-1109). */
export default function PriceIndicesRoute() {
  return (
    <QuerySuspense fallback={<div className="w-full p-6" />}>
      <PriceIndicesPage />
    </QuerySuspense>
  );
}
