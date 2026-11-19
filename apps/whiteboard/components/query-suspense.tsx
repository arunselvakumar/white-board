"use client";

import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import {
  Component,
  type ReactNode,
  Suspense,
  useSyncExternalStore,
} from "react";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";

import { isServerRendered } from "@/lib/server-rendered-routes";

export function PageFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6" aria-busy="true">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
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
 *
 * The boundary is not remounted on navigation: a link click is a transition,
 * so the current page stays until the next one can show its own skeleton,
 * instead of flashing this fallback first. An error is cleared when the
 * path changes.
 */
export function QuerySuspense({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isClient = useIsClient();

  // A path that prefetches on the server renders here too, and its route's
  // `loading.tsx` is its only Suspense boundary: a second one above it
  // would reveal the page in two throttled steps (ADR-0052).
  const serverRendered = isServerRendered(pathname);
  if (!isClient && !serverRendered) return <PageFallback />;

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <QueryErrorBoundary onReset={reset} resetKey={pathname}>
          {serverRendered ? (
            children
          ) : (
            <Suspense fallback={<PageFallback />}>{children}</Suspense>
          )}
        </QueryErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

type QueryErrorBoundaryProps = {
  children: ReactNode;
  onReset: () => void;
  /** The page's path: when it changes, a shown error is cleared. */
  resetKey: string;
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

  override componentDidUpdate(previous: QueryErrorBoundaryProps) {
    if (this.state.error != null && previous.resetKey !== this.props.resetKey) {
      this.props.onReset();
      this.setState({ error: null });
    }
  }

  override render() {
    if (this.state.error != null) {
      return (
        <EmptyState
          className="border"
          icon={WarningCircleIcon}
          tone="danger"
          size="md"
          orbit={false}
          title="Couldn't load this page"
          description="Please try again."
          actions={
            <Button
              type="button"
              onClick={() => {
                this.props.onReset();
                this.setState({ error: null });
              }}
            >
              Try again
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
