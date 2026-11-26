"use client";

import { NotebookIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { EmptyState } from "@repo/ui/components/empty-state";

import { DailyReportSummary } from "@/app/(app)/preschool/family/_components/daily-report-summary";
import { dayLabel } from "@/app/(app)/preschool/family/_components/family-format";
import { FamilyPage } from "@/app/(app)/preschool/family/_components/family-page";
import type { MeChildView } from "@/src/preschool/application/me";
import { preschoolFamilyReportsInfiniteOptions } from "@/src/queries/preschool/family";

function Reports({ child }: { child: MeChildView }) {
  const { data, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSuspenseInfiniteQuery(preschoolFamilyReportsInfiniteOptions(child.id));
  const reports = data.pages.flatMap((page) => page.items);

  if (reports.length === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={NotebookIcon}
        tone="sky"
        title="No Daily Reports yet"
        description={`${child.firstName}'s Teacher sends a report at the end of each day.`}
      />
    );
  return (
    <div className="space-y-4">
      <ul aria-label="Daily Reports" className="space-y-4">
        {reports.map((report) => (
          <li key={report.id}>
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{dayLabel(report.date)}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DailyReportSummary
                  report={report}
                  firstName={child.firstName}
                />
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={isFetchingNextPage}
          onClick={() => {
            void fetchNextPage();
          }}
        >
          {isFetchingNextPage ? "Loading…" : "Load earlier"}
        </Button>
      ) : null}
    </div>
  );
}

/** A Child's published Daily Reports, newest first (Parent). */
export function FamilyReportsScreen() {
  return (
    <FamilyPage title={(child) => `${child.firstName}'s Daily Reports`}>
      {(child) => <Reports key={child.id} child={child} />}
    </FamilyPage>
  );
}
