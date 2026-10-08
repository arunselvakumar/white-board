"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ClipboardCheck, Lock, PenLine, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader } from "@repo/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  classTestQueries,
  type BatchTestsView,
  type StaffClassTestView,
} from "@/src/queries/class-tests";

import { TestFormDialog } from "./test-form-dialog";
import { dayDate } from "./test-staff-format";
import { TestBadges, TestSummary } from "./test-summary";

export function BatchTestsScreen({
  batchId,
  basePath,
}: {
  batchId: string;
  /** `/batches/{id}/tests` for the Owner, `/teacher/batches/{id}/tests` for a Teacher. */
  basePath: string;
}) {
  const { data } = useSuspenseQuery(classTestQueries.batch(batchId));
  return <BatchTestsContent view={data} basePath={basePath} />;
}

function backLink(basePath: string) {
  return basePath.startsWith("/teacher/")
    ? { label: "My Batches", href: "/teacher" }
    : { label: "Batches", href: "/batches" };
}

export function BatchTestsContent({
  view,
  basePath,
}: {
  view: BatchTestsView;
  basePath: string;
}) {
  const [creating, setCreating] = useState(false);
  const openCreate = () => {
    setCreating(true);
  };

  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          back={backLink(basePath)}
          title="Tests"
          meta={`${view.batch.courseName} · ${view.batch.name}`}
          actions={
            <>
              {view.batch.closed ? (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                >
                  Closed
                </Badge>
              ) : null}
              {view.canCreate && view.tests.length > 0 ? (
                <Button type="button" onClick={openCreate}>
                  <Plus aria-hidden="true" />
                  Create test
                </Button>
              ) : null}
            </>
          }
        />
        {view.canCreate ? null : (
          <div className="bg-muted/50 flex items-start gap-2 rounded-2xl border p-4 text-sm">
            <Lock
              aria-hidden="true"
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <p>
              This Batch is closed, so new Tests can’t be added. You can still
              correct and publish marks on its Tests.
            </p>
          </div>
        )}
        <section aria-label="Tests" className="space-y-3">
          {view.tests.length === 0 ? (
            <TestsEmpty canCreate={view.canCreate} onCreate={openCreate} />
          ) : (
            view.tests.map((test) => (
              <TestCard key={test.id} test={test} basePath={basePath} />
            ))
          )}
        </section>
      </div>
      <TestFormDialog
        open={creating}
        onOpenChange={setCreating}
        batchId={view.batch.id}
        firstDate={view.firstDate}
        today={view.today}
        students={view.students}
        testsPath={basePath}
      />
    </main>
  );
}

function TestCard({
  test,
  basePath,
}: {
  test: StaffClassTestView;
  basePath: string;
}) {
  const draft = test.publishedAt == null;
  return (
    <Card aria-label={test.name} role="article">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold break-words">
              <Link
                href={`${basePath}/${test.id}`}
                className="underline-offset-4 hover:underline"
              >
                {test.name}
              </Link>
              <TestBadges test={test} />
            </h3>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>{dayDate(test.heldOn)}</span>
              <span>Out of {test.maxMarks}</span>
              {test.passMarks == null ? null : (
                <span>Pass mark {test.passMarks}</span>
              )}
            </p>
            {test.topic == null ? null : (
              <p className="text-muted-foreground line-clamp-2 text-sm break-words">
                {test.topic}
              </p>
            )}
          </div>
          <Button
            variant={draft ? "default" : "outline"}
            size="sm"
            aria-label={`${draft ? "Enter marks for" : "Open"} ${test.name}`}
            render={<Link href={`${basePath}/${test.id}`} />}
          >
            {draft ? (
              <PenLine aria-hidden="true" />
            ) : (
              <ClipboardCheck aria-hidden="true" />
            )}
            {draft ? "Enter marks" : "Open"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <TestSummary test={test} label={`Results for ${test.name}`} />
      </CardContent>
    </Card>
  );
}

function TestsEmpty({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <Empty className="rounded-2xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ClipboardCheck aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No Tests yet</EmptyTitle>
        <EmptyDescription>
          {canCreate
            ? "Create a Test, enter each Student’s marks, and publish when they’re ready. Students and Parents see only their own results."
            : "No Tests were recorded for this Batch."}
        </EmptyDescription>
      </EmptyHeader>
      {canCreate ? (
        <EmptyContent>
          <Button type="button" onClick={onCreate}>
            <Plus aria-hidden="true" />
            Create test
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
