import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";

const tones = {
  violet:
    "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/20",
  emerald:
    "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20",
  amber:
    "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20",
} as const;

export function CatalogStat({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: LucideIcon;
  tone: keyof typeof tones;
}) {
  return (
    <article className="bg-card flex items-start justify-between gap-4 rounded-2xl border p-5 shadow-sm">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <p className="text-muted-foreground text-xs">{detail}</p>
      </div>
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${tones[tone]}`}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
    </article>
  );
}

export type CatalogPaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
};

export function CatalogPagination({
  noun,
  count,
  pagination,
}: {
  noun: string;
  count: number;
  pagination: CatalogPaginationProps;
}) {
  const first =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const last = Math.min(first + count - 1, pagination.total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
      <p className="text-muted-foreground text-sm">
        Showing {first}–{last} of {pagination.total} {noun}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground mr-2 text-xs">
          Page {pagination.page} of{" "}
          {Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pagination.hasPrevious}
          onClick={pagination.onPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft aria-hidden="true" /> Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!pagination.hasNext}
          onClick={pagination.onNext}
          aria-label="Next page"
        >
          Next <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function CatalogStatus({
  noun,
  error = false,
  onRetry,
}: {
  noun: string;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      className="text-muted-foreground flex min-h-36 flex-col items-center justify-center gap-3 p-6 text-sm"
      role="status"
    >
      {error ? (
        <>
          <p>Couldn’t load {noun}.</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </>
      ) : (
        <>
          <Spinner className="size-5" aria-hidden="true" />
          Loading {noun}…
        </>
      )}
    </div>
  );
}
