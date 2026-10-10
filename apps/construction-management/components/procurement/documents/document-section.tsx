"use client";

import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { Component, Suspense, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";

/**
 * The frame of a document's Remarks / Attachments section: a heading, an
 * optional action beside it, and the body. The body reads with
 * `useSuspenseQuery`; while it loads the section shows a skeleton, and a
 * failed read shows "Try again" in place without taking the page down.
 */
export function DocumentSection({
  heading,
  headingId,
  action,
  children,
}: {
  heading: string;
  headingId: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {heading}
        </h2>
        {action}
      </div>
      <QueryErrorResetBoundary>
        {({ reset }) => (
          <SectionErrorBoundary heading={heading} onReset={reset}>
            <Suspense
              fallback={
                <div className="space-y-3" aria-busy="true">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-2/3" />
                </div>
              }
            >
              {children}
            </Suspense>
          </SectionErrorBoundary>
        )}
      </QueryErrorResetBoundary>
    </section>
  );
}

type BoundaryProps = {
  heading: string;
  onReset: () => void;
  children: ReactNode;
};

class SectionErrorBoundary extends Component<
  BoundaryProps,
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (this.state.error == null) return this.props.children;
    return (
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
        <span>Couldn&apos;t load {this.props.heading.toLowerCase()}.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            this.props.onReset();
            this.setState({ error: null });
          }}
        >
          Try again
        </Button>
      </div>
    );
  }
}
