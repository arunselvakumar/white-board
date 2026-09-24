"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, type ReactNode, Suspense } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Skeleton } from "@repo/ui/components/skeleton";

export function PageFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function QuerySuspense({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <QueryErrorBoundary onReset={reset}>
          <Suspense fallback={<PageFallback />}>{children}</Suspense>
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
