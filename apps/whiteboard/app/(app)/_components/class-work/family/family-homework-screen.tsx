"use client";

import {
  BooksIcon,
  ClipboardTextIcon,
  LinkBreakIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import {
  EmptyState,
  type EmptyStateTone,
} from "@repo/ui/components/empty-state";
import { useAuth } from "@repo/auth/react";
import { Card, CardContent } from "@repo/ui/components/card";
import { BookOpen, ClipboardList } from "lucide-react";
import { PageWatermark } from "@repo/ui/components/page-watermark";
import {
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { useSuspenseQuery } from "@tanstack/react-query";

import type { FamilyHomeRole } from "@/app/(app)/_components/home/family-home";
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

function EmptyText({
  icon,
  tone,
  title,
  children,
  size = "sm",
}: {
  icon: Icon;
  tone?: EmptyStateTone;
  title: string;
  children?: string;
  size?: "sm" | "md";
}) {
  return (
    <EmptyState
      className="border"
      icon={icon}
      tone={tone}
      size={size}
      title={title}
      description={children}
    />
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
      <EmptyText icon={UsersThreeIcon} tone="violet" title="Not in a Batch yet">
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
          <TabsTrigger value="homework">
            <ClipboardList aria-hidden="true" />
            Homework
            {groups.overdue.length > 0 && (
              <>
                <TabsCount
                  aria-hidden="true"
                  className="bg-destructive/10 text-destructive group-data-active/tabs-trigger:bg-destructive/10 group-data-active/tabs-trigger:text-destructive"
                >
                  {groups.overdue.length}
                </TabsCount>
                <span className="sr-only">
                  ({groups.overdue.length} overdue)
                </span>
              </>
            )}
          </TabsTrigger>
          <TabsTrigger value="materials">
            <BookOpen aria-hidden="true" />
            Study Material
          </TabsTrigger>
        </TabsList>
        <TabsContent value="homework" className="space-y-5">
          {student.homework.length === 0 ? (
            <EmptyText
              icon={ClipboardTextIcon}
              tone="sky"
              title="No Homework yet."
            />
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
            <EmptyText
              icon={BooksIcon}
              tone="sky"
              title="No Study Material yet."
            />
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
    <div className="w-full p-6">
      <div className="max-w-3xl space-y-6">
        <div className="relative">
          <PageWatermark text="Homework" />
          <h1 className="text-2xl tracking-tight">Homework</h1>
        </div>
        {classWork.students.length === 0 ? (
          <EmptyText
            icon={LinkBreakIcon}
            tone="pink"
            size="md"
            title={
              role === "parent" ? "No Students linked yet" : "Not linked yet"
            }
          >
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
    </div>
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
