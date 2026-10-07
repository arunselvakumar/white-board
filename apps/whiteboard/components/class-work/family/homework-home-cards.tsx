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
import type { FamilyClassWorkStudentView } from "@/src/queries/class-work";

import {
  homeworkNeedingAttention,
  homeworkPagePath,
  newestMaterials,
} from "./family-class-work-format";
import { HomeworkRow, StudyMaterialItem } from "./family-class-work-items";

const HOME_LIMIT = 5;

function SeeAll({ role, label }: { role: FamilyHomeRole; label: string }) {
  return (
    <CardAction>
      <Link
        href={homeworkPagePath(role)}
        aria-label={label}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        See all
      </Link>
    </CardAction>
  );
}

/**
 * Two Home cards for one Student: Homework that is overdue or due in the
 * next 7 days, and the 5 newest Study Materials (ADR-0033).
 */
export function HomeworkHomeCards({
  student,
  role,
  now,
}: {
  student: FamilyClassWorkStudentView;
  role: FamilyHomeRole;
  now: Date;
}) {
  const homework = homeworkNeedingAttention(student, now, HOME_LIMIT);
  const materials = newestMaterials(student.materials, HOME_LIMIT);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Homework</CardTitle>
          <SeeAll role={role} label="See all Homework" />
        </CardHeader>
        <CardContent className="text-sm">
          {homework.length === 0 ? (
            <p className="text-muted-foreground">Nothing due</p>
          ) : (
            <ul aria-label="Homework due" className="divide-y">
              {homework.map((item) => (
                <HomeworkRow
                  key={item.id}
                  homework={item}
                  student={student}
                  role={role}
                  now={now}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>New Study Material</CardTitle>
          <SeeAll role={role} label="See all Study Material" />
        </CardHeader>
        <CardContent className="text-sm">
          {materials.length === 0 ? (
            <p className="text-muted-foreground">No Study Material yet.</p>
          ) : (
            <ul aria-label="New Study Material" className="divide-y">
              {materials.map((material) => (
                <StudyMaterialItem
                  key={material.id}
                  material={material}
                  student={student}
                  compact
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
