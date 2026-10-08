"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app-shell/page-header";
import { classTestQueries } from "@/src/queries/class-tests";

import {
  StudentTestHistoryList,
  TestHistoryBoundary,
  TestHistoryFallback,
} from "./student-test-history";

type Back = { label: string; href: string };

/**
 * One Student's Tests, for staff. A Teacher sees the Tests in every Batch
 * they're assigned to (ADR-0038, decision 2) and reaches this from a Test.
 */
export function StudentTestHistoryScreen({
  studentId,
  testsBasePath,
  backHref,
  backLabel = "Tests",
}: {
  studentId: string;
  /** `/teacher/batches` for a Teacher, `/batches` for the Owner. */
  testsBasePath: string;
  /** Where staff came from, usually the Batch's Tests. */
  backHref: string;
  backLabel?: string;
}) {
  const back: Back = { label: backLabel, href: backHref };
  return (
    <main className="w-full p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <TestHistoryBoundary
          fallback={
            <HistoryFrame back={back}>
              <TestHistoryFallback />
            </HistoryFrame>
          }
          errorFrame={(message) => (
            <HistoryFrame back={back}>{message}</HistoryFrame>
          )}
        >
          <StudentTestHistoryContent
            studentId={studentId}
            testsBasePath={testsBasePath}
            back={back}
          />
        </TestHistoryBoundary>
      </div>
    </main>
  );
}

function StudentTestHistoryContent({
  studentId,
  testsBasePath,
  back,
}: {
  studentId: string;
  testsBasePath: string;
  back: Back;
}) {
  const { data } = useSuspenseQuery(classTestQueries.student(studentId));
  const teacher = testsBasePath.startsWith("/teacher/");
  return (
    <HistoryFrame
      back={back}
      meta={
        teacher
          ? `${data.student.name} · Tests in your Batches`
          : data.student.name
      }
      label={`${data.student.name}’s Tests`}
    >
      <StudentTestHistoryList
        tests={data.tests}
        testsBasePath={testsBasePath}
      />
    </HistoryFrame>
  );
}

function HistoryFrame({
  back,
  meta,
  label = "Tests",
  children,
}: {
  back: Back;
  meta?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader back={back} title="Test history" meta={meta} />
      <section
        aria-label={label}
        className="bg-card rounded-2xl border p-5 shadow-sm sm:p-7"
      >
        {children}
      </section>
    </>
  );
}
