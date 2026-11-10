"use client";

import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

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
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load this page</EmptyTitle>
          <EmptyDescription>Please try again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
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
        </EmptyContent>
      </Empty>
    </div>
  );
}
