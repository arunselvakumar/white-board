"use client";

import { PlantIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@repo/ui/components/empty-state";

import { FamilyPage } from "@/app/(app)/preschool/family/_components/family-page";
import { formatDate } from "@/app/(app)/preschool/_components/preschool-format";
import type { MeChildView } from "@/src/preschool/application/me";
import { preschoolChildProgressReportsQueryOptions } from "@/src/queries/preschool/progress-reports";

function Reports({
  child,
  childQuery,
}: {
  child: MeChildView;
  childQuery: string;
}) {
  const { data } = useSuspenseQuery(
    preschoolChildProgressReportsQueryOptions(child.id),
  );
  const published = data.items.filter((item) => item.status === "published");
  if (published.length === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={PlantIcon}
        tone="sky"
        title="No Progress Report yet"
        description="The first Progress Report comes at the end of the term."
      />
    );
  return (
    <ul aria-label="Progress Reports" className="space-y-3">
      {published.map((report) => (
        <li key={report.id}>
          <Link
            href={`/preschool/family/progress/${report.id}${childQuery}`}
            className="bg-card hover:border-primary/60 focus-visible:ring-ring/50 flex min-h-16 items-center gap-3 rounded-xl border p-4 outline-none focus-visible:ring-3"
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {report.term.label} · {report.academicYearName}
              </span>
              <span className="text-muted-foreground block text-sm">
                {report.publishedAt == null
                  ? "Published"
                  : `Published ${formatDate(report.publishedAt.slice(0, 10))}`}
              </span>
            </span>
            <ChevronRight
              aria-hidden="true"
              className="text-muted-foreground size-5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A Child's published Progress Reports, one per term (Parent). */
export function FamilyProgressScreen() {
  return (
    <FamilyPage title={(child) => `${child.firstName}'s progress`}>
      {(child, childQuery) => (
        <Reports key={child.id} child={child} childQuery={childQuery} />
      )}
    </FamilyPage>
  );
}
