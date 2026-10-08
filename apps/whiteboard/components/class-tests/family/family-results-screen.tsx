"use client";

import { useAuth } from "@repo/auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { FamilyHomeRole } from "@/components/home/family-home";
import {
  classTestQueries,
  type FamilyTestResultsView,
} from "@/src/queries/class-tests";

import { ResultRow, ScoreTrend } from "./family-result-items";
import {
  NO_RESULTS_TEXT,
  scoreTrends,
  trendDescription,
  type FamilyResultsStudent,
} from "./family-results-format";

function EmptyText({ children }: { children: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** The Student's own scored Tests over time, one line per Batch. */
function ScoresOverTime({
  student,
  role,
}: {
  student: FamilyResultsStudent;
  role: FamilyHomeRole;
}) {
  const trends = scoreTrends(student.results);
  if (trends.length === 0) return null;
  const titleId = `scores-${student.id}`;
  return (
    <Card size="sm" aria-labelledby={titleId} role="region">
      <CardHeader>
        <CardTitle id={titleId}>Scores over time</CardTitle>
        <CardDescription>
          {role === "parent" ? `${student.name}’s` : "Your"} marks as a
          percentage of each Test’s maximum, oldest to newest.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {trends.map((trend) => (
            <ScoreTrend
              key={trend.batchId}
              trend={trend}
              description={trendDescription(trend)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StudentResults({
  student,
  role,
}: {
  student: FamilyResultsStudent;
  role: FamilyHomeRole;
}) {
  if (student.results.length === 0) {
    return (
      <EmptyText>
        {`${NO_RESULTS_TEXT} ${
          role === "parent"
            ? `${student.name}’s marks show here once the centre publishes a Test.`
            : "Your marks show here once the centre publishes a Test."
        }`}
      </EmptyText>
    );
  }
  return (
    <div className="space-y-4">
      <ScoresOverTime student={student} role={role} />
      <Card size="sm">
        <CardContent>
          <ul
            aria-label={
              role === "parent" ? `${student.name}’s results` : "Your results"
            }
            className="divide-y text-sm"
          >
            {student.results.map((result) => (
              <ResultRow key={result.testId} result={result} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The Student's own published Test results, newest first (ADR-0038). A Parent
 * sees one section per linked Student. Nothing here compares a Student with
 * anyone else.
 */
export function FamilyResults({
  results,
  role,
}: {
  results: FamilyTestResultsView;
  role: FamilyHomeRole;
}) {
  return (
    <main className="w-full p-6">
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl tracking-tight">Results</h1>
        {results.students.length === 0 ? (
          <EmptyText>
            {role === "parent"
              ? "No Students are linked to you yet. Ask the centre to add your email address to your child’s Student profile."
              : "Your Student record isn’t linked yet. Ask the centre to check the email address on your Student profile."}
          </EmptyText>
        ) : role === "parent" ? (
          results.students.map((student) => (
            <section
              key={student.id}
              aria-labelledby={`student-${student.id}`}
              className="space-y-3"
            >
              <h2
                id={`student-${student.id}`}
                className="text-lg tracking-tight"
              >
                {student.name}
              </h2>
              <StudentResults student={student} role={role} />
            </section>
          ))
        ) : (
          results.students.map((student) => (
            <StudentResults key={student.id} student={student} role={role} />
          ))
        )}
      </div>
    </main>
  );
}

export function FamilyResultsScreen({ role }: { role: FamilyHomeRole }) {
  const { workspaceId, userId } = useAuth();
  const { data } = useSuspenseQuery(
    classTestQueries.family(`${workspaceId}:${userId}:${role}`),
  );
  return <FamilyResults results={data} role={role} />;
}
