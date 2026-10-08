"use client";

import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import Link from "next/link";

import type { FamilyHomeRole } from "@/components/home/family-home";
import { HOME_RESULT_COUNT } from "@/src/queries/class-tests";

import { ResultRow } from "./family-result-items";
import {
  NO_RESULTS_TEXT,
  resultsPagePath,
  type FamilyResultsStudent,
} from "./family-results-format";

/**
 * The Home card for one Student: their newest published Test results
 * (ADR-0037), with a link to the Results page.
 */
export function ResultsHomeCard({
  student,
  role,
}: {
  student: FamilyResultsStudent;
  role: FamilyHomeRole;
}) {
  const latest = student.results.slice(0, HOME_RESULT_COUNT);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest results</CardTitle>
        <CardAction>
          <Link
            href={resultsPagePath(role)}
            aria-label="See all results"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            See all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="text-sm">
        {latest.length === 0 ? (
          <p className="text-muted-foreground">{NO_RESULTS_TEXT}</p>
        ) : (
          <ul aria-label="Latest results" className="divide-y">
            {latest.map((result) => (
              <ResultRow key={result.testId} result={result} compact />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
