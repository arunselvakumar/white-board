import type { Metadata } from "next";

import { StockRegisterPage } from "@/components/procurement/inventory/stock-register-page";
import { centralStoreHref } from "@/components/procurement/stores/central-store-parts";
import { StockRegisterSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Stock Register" };

/** A Central Store's Stock Register for a date range (CM-506, CM-508). */
export default async function StoreStockRegisterRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-6xl p-6">
      <QuerySuspense
        fallback={
          <StockRegisterSkeleton
            backHref={`/app/workspace/central-store/${encodeURIComponent(id)}`}
          />
        }
      >
        <StockRegisterPage
          location={{ kind: "store", id }}
          backHref={centralStoreHref.store(id)}
        />
      </QuerySuspense>
    </div>
  );
}
