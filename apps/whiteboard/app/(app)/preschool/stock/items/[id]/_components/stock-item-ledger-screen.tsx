"use client";

import { PackageIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Skeleton } from "@repo/ui/components/skeleton";

import {
  RoleGate,
  useActiveCentre,
} from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { StockLedger } from "@/app/(app)/preschool/stock/_components/stock-ledger";
import {
  STOCK_CATEGORY_LABELS,
  stockItemsQueryOptions,
  stockOnHandQueryOptions,
} from "@/src/queries/preschool/stock";

function ItemLedger({ itemId }: { itemId: string }) {
  const { centre } = useActiveCentre();
  const { data: items } = useSuspenseQuery(
    stockItemsQueryOptions({ includeArchived: true }),
  );
  const { data: stock } = useSuspenseQuery(
    stockOnHandQueryOptions({ centreId: centre.id }),
  );
  const item = items.items.find((candidate) => candidate.id === itemId);
  if (item == null)
    return (
      <EmptyState
        className="m-6 border"
        icon={PackageIcon}
        tone="neutral"
        orbit={false}
        title="Stock Item not found"
        description="It may belong to another Workspace."
      />
    );
  const row = stock.items.find((candidate) => candidate.itemId === itemId);
  return (
    <PreschoolPage
      title={item.name}
      meta={[
        STOCK_CATEGORY_LABELS[item.category],
        row == null
          ? null
          : `${row.onHand} ${row.unit} on hand at ${centre.name}`,
        item.reorderLevel == null ? null : `Reorder at ${item.reorderLevel}`,
        row?.low === true ? "Low stock" : null,
        item.isArchived ? "Archived" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      back={{ href: "/preschool/stock", label: "Stock" }}
    >
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <StockLedger key={centre.id} centreId={centre.id} itemId={itemId} />
      </Suspense>
    </PreschoolPage>
  );
}

/** One Stock Item's ledger at the active Centre, with a running balance. */
export function StockItemLedgerScreen({ itemId }: { itemId: string }) {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <ItemLedger itemId={itemId} />
    </RoleGate>
  );
}
