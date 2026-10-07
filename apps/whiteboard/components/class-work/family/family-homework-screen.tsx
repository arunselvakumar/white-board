"use client";

import { useAuth } from "@repo/auth/react";
import { Card, CardContent } from "@repo/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { FamilyHomeRole } from "@/components/home/family-home";
import {
  classWorkQueries,
  type FamilyClassWorkStudentView,
  type FamilyClassWorkView,
  type FamilyHomeworkView,
} from "@/src/queries/class-work";

import { groupHomework, newestMaterials } from "./family-class-work-format";
import { HomeworkRow, StudyMaterialItem } from "./family-class-work-items";

const GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "due", label: "Due" },
  { key: "submitted", label: "Submitted" },
  { key: "checked", label: "Checked" },
  { key: "reference", label: "For reference" },
] as const;

function HomeworkGroup({
  id,
  label,
  items,
  student,
  role,
  now,
}: {
  id: string;
  label: string;
  items: FamilyHomeworkView[];
  student: FamilyClassWorkStudentView;
  role: FamilyHomeRole;
  now: Date;
}) {
  const headingId = `${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3
        id={headingId}
        className={`text-sm font-medium ${label === "Overdue" ? "text-destructive" : "text-muted-foreground"}`}
      >
        {label} ({items.length})
      </h3>
      <Card size="sm">
        <CardContent>
          <ul className="divide-y text-sm">
            {items.map((homework) => (
              <HomeworkRow
                key={homework.id}
                homework={homework}
                student={student}
                role={role}
                now={now}
                showRemark={homework.status === "checked"}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

function EmptyText({ children }: { children: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function StudentClassWork({
  student,
  role,
  now,
}: {
  student: FamilyClassWorkStudentView;
  role: FamilyHomeRole;
  now: Date;
}) {
  if (student.batches.length === 0) {
    return (
      <EmptyText>
        {role === "parent"
          ? `${student.name} isn’t in a Batch yet. Homework and Study Material show here once they join one.`
          : "You aren’t in a Batch yet. Homework and Study Material show here once you join one."}
      </EmptyText>
    );
  }

  const groups = groupHomework(student.homework);
  const materials = newestMaterials(student.materials);
  const ended = student.batches.filter((batch) => batch.access === "ended");
  const scope = `student-${student.id}`;

  return (
    <div className="space-y-4">
      {ended.map((batch) => (
        <p
          key={batch.id}
          className="bg-muted text-muted-foreground rounded-lg px-3 py-2 text-sm"
        >
          {role === "parent" ? `${student.name} left` : "You left"} {batch.name}
          . Items shared before {role === "parent" ? "they" : "you"} left are
          still here.
        </p>
      ))}
      <Tabs defaultValue="homework" className="gap-4">
        <TabsList aria-label="Homework and Study Material">
          <TabsTrigger value="homework" className="px-3 sm:px-4">
            Homework
            {groups.overdue.length > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="bg-destructive/10 text-destructive rounded-full px-1.5 text-xs tabular-nums"
                >
                  {groups.overdue.length}
                </span>
                <span className="sr-only">
                  ({groups.overdue.length} overdue)
                </span>
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="materials" className="px-3 sm:px-4">
            Study Material
          </TabsTrigger>
        </TabsList>
        <TabsContent value="homework" className="space-y-5">
          {student.homework.length === 0 ? (
            <EmptyText>No Homework yet.</EmptyText>
          ) : (
            GROUPS.map(({ key, label }) =>
              groups[key].length === 0 ? null : (
                <HomeworkGroup
                  key={key}
                  id={`${scope}-${key}`}
                  label={label}
                  items={groups[key]}
                  student={student}
                  role={role}
                  now={now}
                />
              ),
            )
          )}
        </TabsContent>
        <TabsContent value="materials">
          {materials.length === 0 ? (
            <EmptyText>No Study Material yet.</EmptyText>
          ) : (
            <Card size="sm">
              <CardContent>
                <ul aria-label="Study Material" className="divide-y text-sm">
                  {materials.map((material) => (
                    <StudyMaterialItem
                      key={material.id}
                      material={material}
                      student={student}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function FamilyHomework({
  classWork,
  role,
  now = new Date(),
}: {
  classWork: FamilyClassWorkView;
  role: FamilyHomeRole;
  now?: Date;
}) {
  return (
    <main className="w-full p-6">
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl tracking-tight">Homework</h1>
        {classWork.students.length === 0 ? (
          <EmptyText>
            {role === "parent"
              ? "No Students are linked to you yet. Ask the centre to add your email address to your child’s Student profile."
              : "Your Student record isn’t linked yet. Ask the centre to check the email address on your Student profile."}
          </EmptyText>
        ) : role === "parent" ? (
          classWork.students.map((student) => (
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
              <StudentClassWork student={student} role={role} now={now} />
            </section>
          ))
        ) : (
          classWork.students.map((student) => (
            <StudentClassWork
              key={student.id}
              student={student}
              role={role}
              now={now}
            />
          ))
        )}
      </div>
    </main>
  );
}

export function FamilyHomeworkScreen({
  role,
  now,
}: {
  role: FamilyHomeRole;
  now?: Date;
}) {
  const { workspaceId, userId } = useAuth();
  const { data } = useSuspenseQuery(
    classWorkQueries.family(`${workspaceId}:${userId}:${role}`),
  );
  return <FamilyHomework classWork={data} role={role} now={now} />;
}
