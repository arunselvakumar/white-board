"use client";

import { LockSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Button } from "@repo/ui/components/button";

import { canInFinance, financeAccessQuery } from "@/src/queries/finance-access";

import {
  PAYMENTS_TABS,
  paymentsPath,
} from "@/app/app/_components/finance/payments-hub/payments-tabs";
import { PaymentsIndexSkeleton } from "./payments-hub-skeletons";

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

  if (query.isPending || first != null) return <PaymentsIndexSkeleton />;
  // A failed read is not "no access": say so and offer to try again.
  if (query.isError)
    return (
      <EmptyState
        icon={WarningCircleIcon}
        tone="danger"
        orbit={false}
        title="Couldn't load Payments"
        description="Check your connection and try again."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </Button>
        }
      />
    );
  return (
    <EmptyState
      icon={LockSimpleIcon}
      tone="neutral"
      orbit={false}
      title="No payments you can see"
      description="Ask the Owner for access to Parties, Transactions, Petty Cash or Other Expenses on this Project."
    />
  );
}
