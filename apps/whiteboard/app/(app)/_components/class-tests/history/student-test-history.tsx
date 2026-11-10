"use client";

import {
  QueryErrorResetBoundary,
  useSuspenseQuery,
} from "@tanstack/react-query";
import Link from "next/link";
import { Component, Suspense, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";

import { passText, resultText } from "@/components/class-tests/result-format";
import {
  classTestQueries,
  type StudentTestHistoryItemView,
} from "@/src/queries/class-tests";
import { QueryHttpError } from "@/src/queries/http";

export const TEST_HISTORY_EMPTY_MESSAGE = "No Tests yet.";
export const TEST_HISTORY_FORBIDDEN_MESSAGE =
  "You can see Test history only for Students in your Batches.";
export const TEST_HISTORY_NOT_FOUND_MESSAGE =
  "This Student isn’t in this Workspace.";
export const TEST_HISTORY_DRAFT_NOTE =
  "Drafts aren’t visible to the Student or Parents until they’re published.";

/** "8 Oct 2026" for a YYYY-MM-DD Test date. */
export function testDateLabel(key: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00.000Z`));
}

/** The path to a Test's page, for the Owner or a Teacher. */
export function testPagePath(
  testsBasePath: string,
  test: Pick<StudentTestHistoryItemView, "id" | "batch">,
): string {
  return `${testsBasePath}/${test.batch.id}/tests/${test.id}`;
}

/**
 * A history read can fail because the Teacher isn't assigned to any of the
 * Student's Batches (403) or the Student isn't in the Workspace (404).
 * Those are answers, not glitches, so they read as plain sentences.
 */
export function testHistoryErrorMessage(error: unknown): {
  message: string;
  retry: boolean;
} {
  if (error instanceof QueryHttpError) {
    if (error.status === 403)
      return { message: TEST_HISTORY_FORBIDDEN_MESSAGE, retry: false };
    if (error.status === 404)
      return { message: TEST_HISTORY_NOT_FOUND_MESSAGE, retry: false };
  }
  return { message: "Couldn’t load Test history.", retry: true };
}

/** "7 Tests · 2 Drafts", "1 Test". */
export function historyCountLabel(tests: number, drafts: number): string {
  const total = `${String(tests)} ${tests === 1 ? "Test" : "Tests"}`;
  if (drafts === 0) return total;
  return `${total} · ${String(drafts)} ${drafts === 1 ? "Draft" : "Drafts"}`;
}

const GRID =
  "md:grid-cols-[6.5rem_minmax(0,1.5fr)_minmax(0,1.1fr)_7rem_minmax(0,1fr)]";

/**
 * A Student's Tests, newest first, drafts marked. A table on wide screens,
 * stacked rows on a phone.
 */
export function StudentTestHistoryList({
  tests,
  testsBasePath,
}: {
  tests: readonly StudentTestHistoryItemView[];
  /** `/batches` for the Owner, `/teacher/batches` for a Teacher. */
  testsBasePath: string;
}) {
  if (tests.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {TEST_HISTORY_EMPTY_MESSAGE}
      </p>
    );
  }
  const drafts = tests.filter((test) => test.publishedAt == null).length;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {historyCountLabel(tests.length, drafts)}
      </p>
      <div className="-mx-5 overflow-hidden border-y sm:-mx-7">
        <div
          aria-hidden="true"
          className={`bg-muted/40 text-muted-foreground hidden gap-4 border-b px-7 py-2.5 text-xs font-medium tracking-wide uppercase md:grid ${GRID}`}
        >
          <span>Date</span>
          <span>Test</span>
          <span>Batch</span>
          <span>Result</span>
          <span>Remark</span>
        </div>
        <ul aria-label="Tests" className="divide-y">
          {tests.map((test) => (
            <TestHistoryRow
              key={test.id}
              test={test}
              testsBasePath={testsBasePath}
            />
          ))}
        </ul>
      </div>
      {drafts > 0 ? (
        <p className="text-muted-foreground text-xs">
          {TEST_HISTORY_DRAFT_NOTE}
        </p>
      ) : null}
    </div>
  );
}

function TestHistoryRow({
  test,
  testsBasePath,
}: {
  test: StudentTestHistoryItemView;
  testsBasePath: string;
}) {
  const draft = test.publishedAt == null;
  const pass =
    test.result == null || test.passMarks == null
      ? null
      : passText(test.result.passed);
  return (
    <li
      className={`hover:bg-muted/50 relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 px-5 py-4 transition-colors sm:px-7 md:items-start md:gap-y-0 ${GRID}`}
    >
      <time
        dateTime={test.heldOn}
        className="text-muted-foreground col-span-2 text-xs tabular-nums md:col-span-1 md:col-start-1 md:row-start-1 md:pt-0.5 md:text-sm"
      >
        {testDateLabel(test.heldOn)}
      </time>
      <div className="min-w-0 md:col-start-2 md:row-start-1">
        <Link
          href={testPagePath(testsBasePath, test)}
          className="focus-visible:ring-ring/50 block rounded-sm font-semibold break-words outline-none after:absolute after:inset-0 focus-visible:ring-3"
        >
          {test.name}
        </Link>
        {draft || test.scope === "student" ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {draft ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
              >
                Draft
              </Badge>
            ) : null}
            {test.scope === "student" ? (
              <Badge variant="outline">Single-student test</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="col-start-2 row-start-2 text-right md:col-start-4 md:row-start-1 md:text-left">
        {test.result == null ? (
          <p className="text-muted-foreground text-sm">Not entered yet</p>
        ) : (
          <p className="text-sm font-medium tabular-nums">
            {resultText(test.result, test.maxMarks)}
          </p>
        )}
        {pass == null ? null : (
          <p
            className={`text-xs ${pass === "Fail" ? "text-destructive font-medium" : "text-muted-foreground"}`}
          >
            {pass}
            {test.passMarks == null
              ? null
              : ` · pass mark ${String(test.passMarks)}`}
          </p>
        )}
      </div>
      <p className="text-muted-foreground md:text-foreground col-span-2 min-w-0 text-sm break-words md:col-span-1 md:col-start-3 md:row-start-1">
        {test.batch.name}
        <span className="text-muted-foreground">
          {" "}
          · {test.batch.courseName}
        </span>
      </p>
      <p
        className={`text-muted-foreground col-span-2 min-w-0 text-sm break-words md:col-span-1 md:col-start-5 md:row-start-1 ${test.result?.remark == null ? "hidden md:block" : ""}`}
      >
        <span className="md:hidden">Remark: </span>
        {test.result?.remark ?? "—"}
      </p>
    </li>
  );
}

/** The Student's history from the API, in its own loading and error state. */
export function StudentTestHistoryLoader({
  studentId,
  testsBasePath,
}: {
  studentId: string;
  testsBasePath: string;
}) {
  const { data } = useSuspenseQuery(classTestQueries.student(studentId));
  return (
    <StudentTestHistoryList tests={data.tests} testsBasePath={testsBasePath} />
  );
}

export function TestHistoryFallback() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

/**
 * Loads its own query, so a slow or failed read never holds up the page
 * around it (the Owner's Student profile).
 */
export function TestHistoryBoundary({
  children,
  fallback = <TestHistoryFallback />,
  errorFrame,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  /** Wraps the error message, e.g. in the page header and card. */
  errorFrame?: (message: ReactNode) => ReactNode;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <TestHistoryErrorBoundary onReset={reset} frame={errorFrame}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </TestHistoryErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

/** The Test history panel on the Owner's Student profile. */
export function StudentTestHistorySection({
  studentId,
  testsBasePath,
}: {
  studentId: string;
  /** `/batches` for the Owner. */
  testsBasePath: string;
}) {
  return (
    <section
      aria-labelledby="test-history-heading"
      className="w-full px-6 pb-6"
    >
      <div className="max-w-4xl rounded-2xl border p-5 sm:p-7">
        <h2 id="test-history-heading" className="mb-4 text-lg font-semibold">
          Test history
        </h2>
        <TestHistoryBoundary>
          <StudentTestHistoryLoader
            studentId={studentId}
            testsBasePath={testsBasePath}
          />
        </TestHistoryBoundary>
      </div>
    </section>
  );
}

type TestHistoryErrorBoundaryProps = {
  children: ReactNode;
  onReset: () => void;
  frame: ((message: ReactNode) => ReactNode) | undefined;
};
type TestHistoryErrorBoundaryState = { error: unknown };

class TestHistoryErrorBoundary extends Component<
  TestHistoryErrorBoundaryProps,
  TestHistoryErrorBoundaryState
> {
  override state: TestHistoryErrorBoundaryState = { error: null };

  static getDerivedStateFromError(
    error: unknown,
  ): TestHistoryErrorBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error == null) return this.props.children;
    const { message, retry } = testHistoryErrorMessage(this.state.error);
    const content = (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <p className="text-muted-foreground text-sm">{message}</p>
        {retry ? (
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
        ) : null}
      </div>
    );
    return this.props.frame == null ? content : this.props.frame(content);
  }
}
