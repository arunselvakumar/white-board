// Helpers for the Student and Parent Results page and Home card (ADR-0038).
// Everything here works on one Student's own published results; nothing
// compares a Student with anyone else.

import type { FamilyHomeRole } from "@/components/home/family-home";
import type {
  FamilyTestResultView,
  FamilyTestResultsView,
} from "@/src/queries/class-tests";

export const NO_RESULTS_TEXT = "No published results yet.";

export type FamilyResultsStudent = FamilyTestResultsView["students"][number];

/** Where a Student's or Parent's Results page lives. */
export function resultsPagePath(role: FamilyHomeRole): string {
  return role === "parent" ? "/parent/results" : "/student/results";
}

/** "Wed, 7 Oct" for a YYYY-MM-DD date. */
export function testDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/** "Python · Python Evening". */
export function resultBatchLabel(result: FamilyTestResultView): string {
  return `${result.batch.courseName} · ${result.batch.name}`;
}

/** The marks as a whole-number percentage of the maximum, or null. */
export function scorePercent(result: FamilyTestResultView): number | null {
  if (result.status !== "scored" || result.marks == null) return null;
  if (result.maxMarks <= 0) return null;
  return Math.round((result.marks / result.maxMarks) * 100);
}

export type ScorePoint = {
  testId: string;
  name: string;
  heldOn: string;
  percent: number;
  passed: boolean | null;
};

export type BatchScoreTrend = {
  batchId: string;
  label: string;
  /** Oldest first. */
  points: ScorePoint[];
};

/**
 * The Student's own scored results per Batch, oldest first, for the
 * "Scores over time" view. Only Batches with two or more scored Tests have a
 * trend to show.
 */
export function scoreTrends(
  results: FamilyTestResultView[],
  minimumPoints = 2,
): BatchScoreTrend[] {
  const byBatch = new Map<string, BatchScoreTrend>();
  // Results arrive newest first; walk them backwards for oldest first.
  for (const result of [...results].reverse()) {
    const percent = scorePercent(result);
    if (percent == null) continue;
    let trend = byBatch.get(result.batch.id);
    if (trend == null) {
      trend = {
        batchId: result.batch.id,
        label: resultBatchLabel(result),
        points: [],
      };
      byBatch.set(result.batch.id, trend);
    }
    trend.points.push({
      testId: result.testId,
      name: result.name,
      heldOn: result.heldOn,
      percent,
      passed: result.passed,
    });
  }
  return [...byBatch.values()].filter(
    (trend) => trend.points.length >= minimumPoints,
  );
}

/** The spoken version of a trend, oldest first. */
export function trendDescription(trend: BatchScoreTrend): string {
  const points = trend.points
    .map(
      (point) =>
        `${point.name} (${testDate(point.heldOn)}) ${String(point.percent)}%`,
    )
    .join(", ");
  return `${trend.label}: ${String(trend.points.length)} scored Tests, oldest first: ${points}.`;
}
