"use client";

import { ChalkboardIcon } from "@phosphor-icons/react/ssr";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { CalendarCheck, NotebookPen } from "lucide-react";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  classroomsQueryOptions,
  type PreschoolClassroom,
} from "@/src/queries/preschool/classrooms";
import { preschoolDailyReportsDayQueryOptions } from "@/src/queries/preschool/daily-reports";

/**
 * Today's figures for one Classroom, from its Daily Reports day (which
 * carries each Child's attendance): one request per card. Nothing shows
 * until it answers.
 */
function TodayLine({ classroom }: { classroom: PreschoolClassroom }) {
  const { data } = useQuery(preschoolDailyReportsDayQueryOptions(classroom.id));
  if (data == null) return null;
  const present = data.children.filter(
    (child) => child.attendance === "present",
  ).length;
  const marked = data.children.some((child) => child.attendance != null);
  return (
    <p className="text-sm">
      Today:{" "}
      <span className="font-medium">
        {marked
          ? `${String(present)} of ${String(data.children.length)} present`
          : "attendance not taken"}
      </span>
      {" · "}
      <span className="font-medium">
        {data.counts.published} of {data.children.length} reports sent
      </span>
    </p>
  );
}

/**
 * A Teacher's Home: their Classrooms in the active Centre this Academic
 * Year, each with the day's two jobs. Built for a phone.
 */
export function TeacherHomeScreen() {
  const { centre, me } = useActiveCentre();
  const { data } = useSuspenseQuery(classroomsQueryOptions(centre.id));
  const firstName = me.userName.split(" ")[0] ?? me.userName;

  return (
    <PreschoolPage
      title={`Hello, ${firstName}`}
      watermark="Home"
      meta={`${centre.name} · ${data.academicYear.name}`}
    >
      {data.items.length === 0 ? (
        <EmptyState
          className="border"
          icon={ChalkboardIcon}
          tone="amber"
          title="No Classrooms yet"
          description="Ask your Centre Head to make you the Class Teacher of a Classroom."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((classroom) => {
            const query = `classroomId=${encodeURIComponent(classroom.id)}`;
            return (
              <li
                key={classroom.id}
                className="bg-card flex min-w-0 flex-col gap-4 rounded-xl border p-4"
              >
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">
                    {classroom.name}
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {classroom.programmeName} · {classroom.childCount}{" "}
                    {classroom.childCount === 1 ? "Child" : "Children"}
                  </p>
                  <TodayLine classroom={classroom} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="h-11"
                    aria-label={`Take attendance for ${classroom.name}`}
                    render={<Link href={`/preschool/attendance?${query}`} />}
                  >
                    <CalendarCheck aria-hidden="true" />
                    Take attendance
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11"
                    aria-label={`Daily Reports for ${classroom.name}`}
                    render={<Link href={`/preschool/daily-reports?${query}`} />}
                  >
                    <NotebookPen aria-hidden="true" />
                    Daily Reports
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PreschoolPage>
  );
}
