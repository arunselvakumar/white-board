"use client";

import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@repo/ui/components/empty-state";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@repo/ui/components/button";

/**
 * A page that failed to load, on the server (its prefetch) or in the browser
 * (a later refetch). Try again clears TanStack's errored queries, asks the
 * server for the page again, and resets this boundary (ADR-0052).
 */
export default function AppError({ reset }: { reset: () => void }) {
  const router = useRouter();
  const { reset: resetQueries } = useQueryErrorResetBoundary();
  const [pending, startTransition] = useTransition();

  return (
    <div className="p-4 sm:p-6">
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
            disabled={pending}
            onClick={() => {
              startTransition(() => {
                resetQueries();
                router.refresh();
                reset();
              });
            }}
          >
            Try again
          </Button>
        }
      />
    </div>
  );
}
