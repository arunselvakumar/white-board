"use client";

import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

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
    <div className="w-full p-6">
      <EmptyState
        icon={WarningCircleIcon}
        tone="danger"
        orbit={false}
        title="Couldn't load this page"
        description="Please try again."
        className="bg-card border"
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
