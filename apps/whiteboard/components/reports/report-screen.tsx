"use client";

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Component,
  Suspense,
  useDeferredValue,
  useMemo,
  type ReactNode,
} from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Spinner } from "@repo/ui/components/spinner";
import Link from "next/link";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  missingCustomDates,
  missingReportSubject,
  reportParamsFromSearch,
  type ReportSubjectNeed,
} from "@/lib/report-params";
import { QueryHttpError } from "@/src/queries/http";
import {
  reportHref,
  reportQueries,
  reportQueryString,
  type ReportCatalogueItem,
  type ReportOptionsResponse,
  type ReportParams,
} from "@/src/queries/reports";
import type { ReportRole } from "@/src/training-institute/domain/report-catalogue";

import { ReportActions } from "./report-actions";
import { ReportDocumentView } from "./report-document-view";
import { ReportFilters } from "./report-filters";
import { ReportPrintStyle } from "./report-print-style";

/** One report: its filters (kept in the URL), the report, and its actions. */
export function ReportScreen({ reportKey }: { reportKey: string }) {
  const [{ data: catalogue }, { data: options }] = useSuspenseQueries({
    queries: [reportQueries.catalogue(), reportQueries.options()],
  });
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(
    () => reportParamsFromSearch(searchParams),
    [searchParams],
  );
  const item = catalogue.items.find((entry) => entry.key === reportKey);

  if (item == null) return <ReportNotAvailable />;

  return (
    <ReportContent
      item={item}
      options={options}
      role={catalogue.role}
      params={params}
      onParamsChange={(next) => {
        const query = reportQueryString(next);
        router.replace(query === "" ? pathname : `${pathname}?${query}`, {
          scroll: false,
        });
      }}
    />
  );
}

function ReportNotAvailable() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>This report isn&apos;t available to you.</EmptyTitle>
          <EmptyDescription>
            Open Reports to see the reports you can use.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/reports" className={buttonVariants()}>
            Open Reports
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  );
}

/** The report screen with its filters given, for the page and Storybook. */
export function ReportContent({
  item,
  options,
  role,
  params,
  onParamsChange,
}: {
  item: ReportCatalogueItem;
  options: ReportOptionsResponse;
  role: ReportRole;
  params: ReportParams;
  onParamsChange: (params: ReportParams) => void;
}) {
  // A new filter renders in the background: the last report stays on screen
  // until the new one has loaded, instead of flashing the fallback.
  const shownParams = useDeferredValue(params);
  const updating = shownParams !== params;
  const need = missingReportSubject(item.key, role, shownParams);
  const datesMissing = missingCustomDates(shownParams);
  const ready = need == null && !datesMissing;
  // The same cache entry the report below suspends on; read here only for
  // the defaults the filter bar shows, so it never fetches on its own.
  const { data: shown } = useQuery({
    ...reportQueries.document(item.key, shownParams),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6 print:gap-0 print:p-0">
      <div className="print:hidden">
        <PageHeader
          back={{ label: "Reports", href: "/reports" }}
          title={item.title}
          meta={`${item.code} · ${item.purpose}`}
          actions={
            ready ? (
              <ReportActions
                item={item}
                role={role}
                params={shownParams}
                month={shownParams.month ?? options.today.slice(0, 7)}
              />
            ) : null
          }
        />
      </div>
      <ReportFilters
        item={item}
        options={options}
        role={role}
        params={params}
        documentFilters={shown?.filters ?? []}
        shownPeriod={shown?.period ?? null}
        onChange={onParamsChange}
      />
      {updating ? (
        <div
          role="status"
          className="text-muted-foreground flex items-center gap-2 text-xs print:hidden"
        >
          <Spinner aria-hidden="true" className="size-4" />
          Updating the report…
        </div>
      ) : null}
      <div
        className={updating ? "opacity-60 transition-opacity" : undefined}
        aria-busy={updating}
      >
        {need != null ? (
          <ChooseSubject need={need} />
        ) : datesMissing ? (
          <ChoosePrompt
            title="Choose a start and end date"
            description="A custom range needs both dates, up to two years apart."
          />
        ) : (
          <ReportErrorBoundary
            resetKey={`${item.key}?${reportQueryString(shownParams)}`}
            reportKey={item.key}
          >
            <Suspense fallback={<ReportFallback />}>
              <ReportDocumentPanel item={item} params={shownParams} />
            </Suspense>
          </ReportErrorBoundary>
        )}
      </div>
    </div>
  );
}

function ReportDocumentPanel({
  item,
  params,
}: {
  item: ReportCatalogueItem;
  params: ReportParams;
}) {
  const { data: document } = useSuspenseQuery(
    reportQueries.document(item.key, params),
  );
  return (
    <>
      <ReportPrintStyle document={document} />
      <ReportDocumentView document={document} />
    </>
  );
}

const SUBJECT_COPY: Record<
  ReportSubjectNeed,
  { title: string; description: string }
> = {
  student: {
    title: "Choose a Student",
    description: "This report is about one Student. Pick one above.",
  },
  batch: {
    title: "Choose a Batch",
    description: "This report is about one Batch. Pick one above.",
  },
  studentOrBatch: {
    title: "Choose a Student or a Batch",
    description:
      "Pick one Student, or a whole Batch for one sheet per Student.",
  },
};

function ChooseSubject({ need }: { need: ReportSubjectNeed }) {
  return <ChoosePrompt {...SUBJECT_COPY[need]} />;
}

function ChoosePrompt({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="border print:hidden">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ReportFallback() {
  return (
    <div className="space-y-4 rounded-2xl border p-6" aria-busy="true">
      <Skeleton className="h-6 w-64" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

type ReportErrorBoundaryProps = {
  /** A new key (other filters) clears the error and tries again. */
  resetKey: string;
  reportKey: ReportCatalogueItem["key"];
  children: ReactNode;
};

type ReportErrorBoundaryState = {
  error: Error | null;
  resetKey: string;
};

/**
 * A report that can't be built for these filters (a bad custom range, a
 * Student no longer visible) says why next to the filters, instead of
 * replacing the whole page.
 */
class ReportErrorBoundary extends Component<
  ReportErrorBoundaryProps,
  ReportErrorBoundaryState
> {
  override state: ReportErrorBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(
    error: Error,
  ): Partial<ReportErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ReportErrorBoundaryProps,
    state: ReportErrorBoundaryState,
  ): Partial<ReportErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
  }

  override render() {
    const { error } = this.state;
    if (error == null) return this.props.children;
    const known = error instanceof QueryHttpError && error.status < 500;
    return (
      <ReportErrorState
        message={known ? error.message : "Couldn’t load this report."}
        reportKey={this.props.reportKey}
        onRetry={() => {
          this.setState({ error: null });
        }}
      />
    );
  }
}

function ReportErrorState({
  message,
  reportKey,
  onRetry,
}: {
  message: string;
  reportKey: ReportCatalogueItem["key"];
  onRetry: () => void;
}) {
  const queryClient = useQueryClient();
  return (
    <Empty className="border" role="alert">
      <EmptyHeader>
        <EmptyTitle>{message}</EmptyTitle>
        <EmptyDescription>
          Change the filters above, or try again.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void queryClient
              .resetQueries({
                queryKey: [...reportQueries.key.documents(), reportKey],
              })
              .then(onRetry);
          }}
        >
          Try again
        </Button>
        <Link
          href={reportHref(reportKey)}
          className={buttonVariants({ variant: "ghost" })}
        >
          Clear filters
        </Link>
      </EmptyContent>
    </Empty>
  );
}
