"use client";

import { ChalkboardIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense } from "react";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Skeleton } from "@repo/ui/components/skeleton";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  ClassroomDayBar,
  useClassroomDay,
} from "@/app/(app)/preschool/_components/classroom-day-bar";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";

import { DailyReportsDay } from "./daily-reports-day";

/**
 * Daily Reports for a Classroom and day: the Classroom's menu and
 * activities once, each present Child's report, then Publish to Parents.
 */
export function DailyReportsScreen() {
  const { centre } = useActiveCentre();
  const { data: classrooms } = useSuspenseQuery(
    classroomsQueryOptions(centre.id),
  );
  const day = useClassroomDay(classrooms.items);

  if (day.classroomId == null)
    return (
      <PreschoolPage title="Daily Reports">
        <EmptyState
          className="border"
          icon={ChalkboardIcon}
          tone="amber"
          title="No Classrooms to report on"
          description="Daily Reports are written per Classroom. Ask the Centre Head to make you a Class Teacher."
        />
      </PreschoolPage>
    );

  return (
    <PreschoolPage title="Daily Reports" meta={null}>
      <ClassroomDayBar
        classrooms={classrooms.items}
        classroomId={day.classroomId}
        onClassroomChange={day.setClassroomId}
        date={day.date}
        today={day.today}
        onDateChange={day.setDate}
      />
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        }
      >
        <DailyReportsDay
          key={`${day.classroomId}-${day.date}`}
          classroomId={day.classroomId}
          date={day.date}
        />
      </Suspense>
    </PreschoolPage>
  );
}
