import type { ReactNode } from "react";

import { SkeletonText } from "@repo/ui/components/skeleton-kit";

import { PageHeader, type PageHeaderBack } from "./page-header";

/**
 * `PageHeader` for a page whose title is data (a Vendor's name, a Purchase
 * Order number). The back link and actions are real; the title and meta are
 * bars of the same height (ADR-0047).
 */
export function PageHeaderSkeleton({
  back,
  meta = true,
  leading,
  actions,
}: {
  back?: PageHeaderBack;
  meta?: boolean;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <PageHeader
      back={back}
      title={
        <>
          <span className="sr-only">Loading</span>
          <SkeletonText size="3xl" width="min(16rem, 70vw)" />
        </>
      }
      meta={meta ? <SkeletonText width="min(22rem, 80vw)" /> : undefined}
      leading={leading}
      actions={actions}
    />
  );
}
