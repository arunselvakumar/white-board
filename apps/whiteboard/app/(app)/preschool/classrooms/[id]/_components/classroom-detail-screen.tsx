"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent } from "@repo/ui/components/card";

import {
  RoleGate,
  useActiveCentre,
} from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import { SeatsMeter } from "@/app/(app)/preschool/_components/seats-meter";
import { todayInIndia } from "@/src/preschool/domain/dates";
import { academicYearsQueryOptions } from "@/src/queries/preschool/academic-years";
import { classroomQueryOptions } from "@/src/queries/preschool/classrooms";

import { ClassTeachersEditor } from "./class-teachers-editor";
import { RosterTable } from "./roster-table";

/** One Classroom: its year, seats, Class Teachers and roster. */
export function ClassroomDetailScreen({
  classroomId,
}: {
  classroomId: string;
}) {
  const { me } = useActiveCentre();
  const { data: classroom } = useSuspenseQuery(
    classroomQueryOptions(classroomId),
  );
  const { data: years } = useSuspenseQuery(academicYearsQueryOptions());
  const year = years.items.find((item) => item.id === classroom.academicYearId);
  const manager = me.role === "owner" || me.role === "centre_head";

  return (
    <PreschoolPage
      title={classroom.name}
      watermark="Classrooms"
      meta={`${classroom.programmeName} · ${year?.name ?? "Academic Year"}`}
      back={
        manager
          ? { href: "/preschool/classrooms", label: "Classrooms" }
          : undefined
      }
      leading={
        classroom.isArchived ? (
          <Badge variant="outline">Archived</Badge>
        ) : undefined
      }
    >
      <Card size="sm" className="sm:max-w-md">
        <CardContent className="space-y-2">
          <p className="text-sm">
            Capacity <span className="font-semibold">{classroom.capacity}</span>{" "}
            · {classroom.childCount}{" "}
            {classroom.childCount === 1 ? "Child" : "Children"}
          </p>
          <SeatsMeter
            childCount={classroom.childCount}
            capacity={classroom.capacity}
          />
        </CardContent>
      </Card>
      <RoleGate
        roles={["owner", "centre_head"]}
        fallback={
          <p className="text-muted-foreground text-sm">
            Class Teachers:{" "}
            {classroom.teachers.map((teacher) => teacher.name).join(", ") ||
              "none yet"}
          </p>
        }
      >
        <ClassTeachersEditor classroom={classroom} />
      </RoleGate>
      <section aria-labelledby="roster-heading" className="space-y-3">
        <h2 id="roster-heading" className="text-lg font-semibold">
          Children
        </h2>
        <RosterTable
          roster={classroom.roster}
          today={todayInIndia(new Date())}
        />
      </section>
    </PreschoolPage>
  );
}
