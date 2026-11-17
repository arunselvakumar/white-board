import type { Metadata } from "next";

import { StockRegisterPage } from "@/app/app/_components/procurement/inventory/stock-register-page";
import { centralStoreHref } from "@/app/app/_components/procurement/stores/central-store-parts";
import { StockRegisterSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";
import { pageHref } from "@/lib/page-href";

export const metadata: Metadata = { title: "Stock Register" };

/** A Central Store's Stock Register for a date range. */
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
            backHref={pageHref("/app/workspace/central-store/[id]", { id })}
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
