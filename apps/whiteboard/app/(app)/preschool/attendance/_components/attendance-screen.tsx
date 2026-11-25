"use client";

import { ChalkboardIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, ListChecks } from "lucide-react";
import { Suspense, useState } from "react";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  ClassroomDayBar,
  useClassroomDay,
} from "@/app/(app)/preschool/_components/classroom-day-bar";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";

import { AttendanceDay } from "./attendance-day";
import { AttendanceMonth } from "./attendance-month";

function Loading() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}

/**
 * Attendance for a Classroom: the day's register (check-in, check-out and
 * who collected) and the monthly register. A Teacher sees their own
 * Classrooms; the Owner and Centre Heads see every Classroom of the Centre.
 */
export function AttendanceScreen() {
  const { centre } = useActiveCentre();
  const { data: classrooms } = useSuspenseQuery(
    classroomsQueryOptions(centre.id),
  );
  const day = useClassroomDay(classrooms.items);
  const [view, setView] = useState<"day" | "month">("day");
  const [month, setMonth] = useState(day.today.slice(0, 7));

  if (day.classroomId == null)
    return (
      <PreschoolPage title="Attendance">
        <EmptyState
          className="border"
          icon={ChalkboardIcon}
          tone="amber"
          title="No Classrooms to mark"
          description="Attendance is taken per Classroom. Ask the Centre Head to make you a Class Teacher."
        />
      </PreschoolPage>
    );

  return (
    <PreschoolPage title="Attendance" meta={null}>
      <Tabs
        value={view}
        onValueChange={(value: "day" | "month") => {
          setView(value);
        }}
        className="gap-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <ClassroomDayBar
            classrooms={classrooms.items}
            classroomId={day.classroomId}
            onClassroomChange={day.setClassroomId}
            date={day.date}
            today={day.today}
            onDateChange={day.setDate}
            hideDate={view === "month"}
          />
          <TabsList aria-label="Attendance view" className="print:hidden">
            <TabsTrigger value="day" className="h-11">
              <ListChecks aria-hidden="true" />
              Day
            </TabsTrigger>
            <TabsTrigger value="month" className="h-11">
              <CalendarDays aria-hidden="true" />
              Month
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="day">
          <Suspense fallback={<Loading />}>
            <AttendanceDay
              key={`${day.classroomId}-${day.date}`}
              classroomId={day.classroomId}
              date={day.date}
              today={day.today}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="month">
          <Suspense fallback={<Loading />}>
            <AttendanceMonth
              classroomId={day.classroomId}
              month={month}
              currentMonth={day.today.slice(0, 7)}
              onMonthChange={setMonth}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </PreschoolPage>
  );
}
