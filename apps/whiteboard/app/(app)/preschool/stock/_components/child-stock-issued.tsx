"use client";

import { PackageIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Skeleton } from "@repo/ui/components/skeleton";

import { feeDateLabel } from "@/lib/preschool-fees";
import { childStockQueryOptions } from "@/src/queries/preschool/stock";

function IssuedList({ childId }: { childId: string }) {
  const { data } = useSuspenseQuery(childStockQueryOptions(childId));
  if (data.items.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={PackageIcon}
        tone="orange"
        title="Nothing issued yet"
        description="Books, uniforms and kits handed to this Child show here."
      />
    );
  return (
    <ul className="divide-y text-sm">
      {data.items.map((row) => (
        <li
          key={row.movementId}
          className="flex items-baseline justify-between gap-3 py-2"
        >
          <span className="min-w-0">
            <span className="font-medium">{row.itemName}</span>
            {row.note == null ? null : (
              <span className="text-muted-foreground block text-xs">
                {row.note}
              </span>
            )}
          </span>
          <span className="text-muted-foreground shrink-0 text-right tabular-nums">
            {row.quantity} {row.unit} · {feeDateLabel(row.movedOn)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What a Child has been handed (books, uniform, kit), as a card for the Child
 * page. Readable by managers, the Child's Class Teacher and Parents.
 */
export function ChildStockIssued({ childId }: { childId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Books, kit and uniform received</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <IssuedList childId={childId} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
