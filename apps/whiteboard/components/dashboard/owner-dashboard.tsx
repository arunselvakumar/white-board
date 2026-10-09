"use client";

import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";

import { formatPaiseAsRupees } from "@/lib/money";
import type { DashboardResponse } from "@/src/queries/dashboard";

export function OwnerDashboard({
  dashboard,
  hasCourses,
  onAddCourse,
  onOpenBatch,
  onOpenStudent,
  onOpenStudents,
  onOpenFees,
}: {
  dashboard: DashboardResponse;
  hasCourses: boolean;
  onAddCourse: () => void;
  onOpenBatch: (id: string) => void;
  onOpenStudent: (id: string) => void;
  onOpenStudents: () => void;
  onOpenFees: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-6">
      <h1 className="text-2xl tracking-tight">Owner Dashboard</h1>
      {hasCourses ? null : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              Add the first Course this centre teaches.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={onAddCourse}>
              Add Course
            </Button>
          </EmptyContent>
        </Empty>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Button
          type="button"
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4"
          onClick={onOpenStudents}
        >
          <span className="text-muted-foreground text-sm font-normal">
            Active Students
          </span>
          <span className="text-2xl tracking-tight">
            {dashboard.activeStudentCount}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4"
          onClick={onOpenFees}
        >
          <span className="text-muted-foreground text-sm font-normal">
            Outstanding dues
          </span>
          <span className="text-2xl tracking-tight">
            {formatPaiseAsRupees(dashboard.outstandingDuesPaise)}
          </span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-auto flex-col items-start gap-1 p-4"
          onClick={onOpenFees}
        >
          <span className="text-muted-foreground text-sm font-normal">
            Follow-ups due today
          </span>
          <span
            className={`text-2xl tracking-tight ${dashboard.feeFollowUpsDueCount > 0 ? "text-amber-700 dark:text-amber-200" : ""}`}
          >
            {dashboard.feeFollowUpsDueCount}
          </span>
        </Button>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg tracking-tight">Today’s Batches</h2>
        {dashboard.todayBatches.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Batches run today.</p>
        ) : (
          <ul className="space-y-2">
            {dashboard.todayBatches.map((batch) => (
              <li key={batch.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start py-3"
                  onClick={() => {
                    onOpenBatch(batch.id);
                  }}
                >
                  <span className="flex flex-col items-start gap-1">
                    <span>{batch.name}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {batch.enrolledCount}/{batch.capacity} · Today{" "}
                      {batch.todayClasses
                        .map((slot) => `${slot.startTime}–${slot.endTime}`)
                        .join(", ")}
                      {batch.todayClasses.some((slot) => slot.rescheduled) &&
                        " · Rescheduled"}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg tracking-tight">Recent Students</h2>
        {dashboard.recentStudents.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No Students admitted yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {dashboard.recentStudents.map((student) => (
              <li key={student.id}>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-start py-3"
                  onClick={() => {
                    onOpenStudent(student.id);
                  }}
                >
                  <span className="flex flex-col items-start gap-1">
                    <span>{student.name}</span>
                    <span className="text-muted-foreground text-xs font-normal">
                      {student.phone}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
