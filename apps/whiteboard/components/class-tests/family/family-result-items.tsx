"use client";

import { Badge } from "@repo/ui/components/badge";

import {
  passText,
  RESULT_STATUS_LABEL,
  resultText,
} from "@/components/class-tests/result-format";
import {
  formatMarks,
  type FamilyTestResultView,
} from "@/src/queries/class-tests";

import {
  resultBatchLabel,
  testDate,
  type BatchScoreTrend,
} from "./family-results-format";

/** Subtle marker for a Test set for this Student alone, such as a re-test. */
export const INDIVIDUAL_TEST_LABEL = "Individual Test";

/** "34 / 50" (read as "34 out of 50"), or Absent / Exempt. */
function ResultValue({ result }: { result: FamilyTestResultView }) {
  if (result.status === "scored" && result.marks != null) {
    return (
      <span className="font-medium tabular-nums">
        <span aria-hidden="true">{resultText(result, result.maxMarks)}</span>
        <span className="sr-only">
          {formatMarks(result.marks)} out of {String(result.maxMarks)}
        </span>
      </span>
    );
  }
  return (
    <span className="text-muted-foreground font-medium">
      {RESULT_STATUS_LABEL[result.status]}
    </span>
  );
}

function PassBadge({ passed }: { passed: boolean | null }) {
  const text = passText(passed);
  if (text == null) return null;
  return (
    <Badge variant={text === "Fail" ? "destructive" : "secondary"}>
      {text}
    </Badge>
  );
}

/**
 * One published result: Test name, Batch, date, marks or Absent / Exempt,
 * Pass or Fail when the Test has a pass mark, and the Teacher's remark.
 * `compact` drops the topic, pass mark, and remark for Home.
 */
export function ResultRow({
  result,
  compact = false,
}: {
  result: FamilyTestResultView;
  compact?: boolean;
}) {
  const remark = result.remark?.trim();
  const topic = result.topic?.trim();
  return (
    <li className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium break-words">{result.name}</span>
          {result.scope === "student" && (
            <Badge variant="outline" className="text-muted-foreground">
              {INDIVIDUAL_TEST_LABEL}
            </Badge>
          )}
        </p>
        <p className="text-muted-foreground text-xs">
          {resultBatchLabel(result)} · {testDate(result.heldOn)}
        </p>
        {!compact && (
          <>
            {result.status === "scored" && result.passMarks != null && (
              <p className="text-muted-foreground text-xs">
                Pass mark {String(result.passMarks)} of{" "}
                {String(result.maxMarks)}
              </p>
            )}
            {topic != null && topic.length > 0 && (
              <p className="text-muted-foreground line-clamp-2 text-xs break-words">
                Topic: {topic}
              </p>
            )}
            {remark != null && remark.length > 0 && (
              <p className="pt-1 text-sm break-words whitespace-pre-line">
                <span className="text-muted-foreground">Remark: </span>
                {remark}
              </p>
            )}
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <ResultValue result={result} />
        <PassBadge passed={result.passed} />
      </div>
    </li>
  );
}

const WIDTH = 160;
const HEIGHT = 40;
const PAD = 4;

/**
 * A small line of one Batch's own scored Tests as a percentage of maximum
 * marks, oldest to newest. The picture is decorative for screen readers;
 * `description` carries every point.
 */
export function ScoreTrend({
  trend,
  description,
}: {
  trend: BatchScoreTrend;
  description: string;
}) {
  const { points } = trend;
  const step = points.length > 1 ? (WIDTH - PAD * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    point,
    x: PAD + index * step,
    y: PAD + ((100 - point.percent) / 100) * (HEIGHT - PAD * 2),
  }));
  const latest = points[points.length - 1];
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="break-words">{trend.label}</p>
        <p className="text-muted-foreground text-xs">
          {points.length} scored Tests
          {latest != null && ` · latest ${String(latest.percent)}%`}
        </p>
      </div>
      <svg
        role="img"
        aria-label={description}
        viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
        width={WIDTH}
        height={HEIGHT}
        className="shrink-0 overflow-visible"
      >
        <line
          x1={PAD}
          x2={WIDTH - PAD}
          y1={HEIGHT - PAD}
          y2={HEIGHT - PAD}
          className="stroke-border"
          strokeWidth={1}
        />
        <polyline
          points={coords
            .map(({ x, y }) => `${String(x)},${String(y)}`)
            .join(" ")}
          fill="none"
          className="stroke-primary"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map(({ point, x, y }) => (
          <circle
            key={point.testId}
            cx={x}
            cy={y}
            r={2.5}
            className={
              point.passed === false ? "fill-destructive" : "fill-primary"
            }
          />
        ))}
      </svg>
    </li>
  );
}
