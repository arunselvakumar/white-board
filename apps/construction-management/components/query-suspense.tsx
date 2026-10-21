"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  Component,
  type ReactNode,
  Suspense,
  useSyncExternalStore,
} from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
} from "@repo/ui/components/skeleton-kit";

/**
 * The root fallback for a page that suspends before its own skeleton: the
 * `p-6` frame, a page header and a table, the shape most pages have
 * (ADR-0047). Pages that look different render their own skeleton.
 */
export function PageFallback() {
  return (
    <div className="w-full p-6">
      <SkeletonGroup className="w-full max-w-4xl space-y-6">
        <div className="space-y-1">
          <SkeletonText size="3xl" width="min(16rem, 70vw)" />
          <SkeletonText width="min(22rem, 80vw)" />
        </div>
        <TableSkeleton
          bordered
          columns={[
            { header: <SkeletonText width="4rem" /> },
            { header: <SkeletonText width="5rem" />, kind: "muted" },
            { header: <SkeletonText width="4rem" />, kind: "muted" },
            { header: null, kind: "badge", className: "w-24" },
          ]}
        />
      </SkeletonGroup>
    </div>
  );
}

const noSubscription = () => () => undefined;

/** False on the server and during hydration, true after. */
function useIsClient(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * Page reads run in the browser only (ADR-0026): query functions fetch
 * relative `/api/...` URLs with the browser's Session cookie, which the
 * server render has neither of. The shell around this renders on the server.
 */
export function QuerySuspense({
  children,
  fallback = <PageFallback />,
}: {
  children: ReactNode;
  /** What shows while loading; `null` for a section that may stay empty. */
  fallback?: ReactNode;
}) {
  const pathname = usePathname();
  const isClient = useIsClient();

  if (!isClient) return fallback;

  return (
    <QueryErrorResetBoundary key={pathname}>
      {({ reset }) => (
        <QueryErrorBoundary onReset={reset}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </QueryErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

type QueryErrorBoundaryProps = {
  children: ReactNode;
  onReset: () => void;
};

type QueryErrorBoundaryState = {
  error: Error | null;
};

class QueryErrorBoundary extends Component<
  QueryErrorBoundaryProps,
  QueryErrorBoundaryState
> {
  override state: QueryErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): QueryErrorBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error != null) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load this page</EmptyTitle>
            <EmptyDescription>Please try again.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              onClick={() => {
                this.props.onReset();
                this.setState({ error: null });
              }}
            >
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    return this.props.children;
  }
}
