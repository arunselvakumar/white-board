"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";

import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";

import { PAYMENTS_TABS, paymentsPath } from "./payments-tabs";

/** `/payments` opens the first tab the viewer may read. */
export function PaymentsIndex({ projectId }: { projectId: string }) {
  const router = useRouter();
  const query = useQuery(financeAccessQuery(projectId));
  const access = query.data;
  const first =
    access == null
      ? null
      : (PAYMENTS_TABS.find((tab) =>
          tab.menus.some((menu) => canInFinance(access, menu, "read")),
        ) ?? null);

  useEffect(() => {
    if (first != null) router.replace(paymentsPath(projectId, first.segment));
  }, [first, projectId, router]);

  if (query.isPending || first != null)
    return <Skeleton className="h-40 w-full" />;
  // A failed read is not "no access": say so and offer to try again.
  if (query.isError)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load Payments</EmptyTitle>
          <EmptyDescription>
            Check your connection and try again.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void query.refetch();
          }}
        >
          Try again
        </Button>
      </Empty>
    );
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>No payments you can see</EmptyTitle>
        <EmptyDescription>
          Ask the Owner for access to Parties, Transactions, Petty Cash or Other
          Expenses on this Project.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
