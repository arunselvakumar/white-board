"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { termOn } from "@/src/preschool/domain/progress";
import {
  PRESCHOOL_TERM_LABELS,
  PRESCHOOL_TERMS,
  preschoolClassroomProgressReportsQueryOptions,
  type PreschoolTerm,
} from "@/src/queries/preschool/progress-reports";

import { ReportEditor, type EditorTarget } from "./report-editor";

const STATUS_LABEL = {
  none: "Not started",
  draft: "Draft",
  published: "Published",
} as const;

const STATUS_BADGE = {
  none: "outline",
  draft: "secondary",
  published: "default",
} as const;

function Roster({
  classroomId,
  term,
  onOpen,
}: {
  classroomId: string;
  term: PreschoolTerm;
  onOpen: (target: EditorTarget) => void;
}) {
  const { data } = useSuspenseQuery(
    preschoolClassroomProgressReportsQueryOptions(classroomId, term),
  );
  if (data.children.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No Children in this Classroom.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.term.label}, {data.academicYear.name}: {data.counts.published}{" "}
        published · {data.counts.draft} draft · {data.counts.none} not started
      </p>
      <ul className="space-y-2" aria-label="Reports">
        {data.children.map((child) => (
          <li
            key={child.childId}
            className="bg-card flex items-center gap-3 rounded-xl border p-3"
          >
            <ChildAvatar
              childId={child.childId}
              name={child.name}
              photoUrl={child.photoUrl}
              className="size-10 shrink-0"
            />
            <p className="min-w-0 flex-1 truncate font-medium">{child.name}</p>
            <Badge variant={STATUS_BADGE[child.status]}>
              {STATUS_LABEL[child.status]}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Open ${child.name}'s report`}
              onClick={() => {
                onOpen({
                  childId: child.childId,
                  childName: child.name,
                  reportId: child.reportId,
                  term: data.term.term,
                  termLabel: data.term.label,
                  termStartsOn: data.term.startsOn,
                  termEndsOn: data.term.endsOn,
                  academicYearId: data.academicYear.id,
                });
              }}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A term's Progress Reports for the Classroom, and the editor for one Child's. */
export function ReportsTab({ classroomId }: { classroomId: string }) {
  const { me } = useActiveCentre();
  const [term, setTerm] = useState<PreschoolTerm>(
    () => termOn(me.currentAcademicYear, todayInIndia(new Date())) ?? "term_1",
  );
  const [target, setTarget] = useState<EditorTarget | null>(null);
  return (
    <div className="space-y-4">
      {target == null ? (
        <>
          <FilterTabs
            aria-label="Term"
            value={term}
            onValueChange={setTerm}
            items={PRESCHOOL_TERMS.map((value) => ({
              value,
              label: PRESCHOOL_TERM_LABELS[value],
            }))}
          />
          <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
            <Roster classroomId={classroomId} term={term} onOpen={setTarget} />
          </Suspense>
        </>
      ) : (
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <ReportEditor
            key={`${target.childId}-${target.term}`}
            target={target}
            canUnpublish={me.role === "owner" || me.role === "centre_head"}
            onBack={() => {
              setTarget(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
