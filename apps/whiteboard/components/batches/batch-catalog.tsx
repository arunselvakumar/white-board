"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarDays, DoorOpen, Plus, UsersRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { classModeLabel, formatTimingSlots } from "@/lib/class-mode";
import {
  CatalogPagination,
  CatalogStat,
  CatalogStatus,
  type CatalogPaginationProps,
} from "@/components/catalog/catalog-chrome";
import type { BatchResponse } from "@/src/queries/batches";

export function BatchCatalog({
  batches,
  courses,
  courseId,
  onCourseIdChange,
  onAdd,
  onAddCourse,
  onEdit,
  onClose,
  pagination,
  loading = false,
  loadError = false,
  onRetry,
}: {
  batches: BatchResponse[];
  courses: { id: string; name: string }[];
  courseId: string;
  onCourseIdChange: (courseId: string) => void;
  onAdd: () => void;
  onAddCourse?: () => void;
  onEdit: (batch: BatchResponse) => void;
  onClose: (batch: BatchResponse) => void | Promise<void>;
  pagination?: CatalogPaginationProps;
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}) {
  const [pendingClose, setPendingClose] = useState<BatchResponse | null>(null);
  const courseItems = [
    { value: "all", label: "All Courses" },
    ...courses.map((course) => ({ value: course.id, label: course.name })),
  ];
  const courseNameById = new Map(
    courses.map((course) => [course.id, course.name]),
  );
  const noCourses = courses.length === 0;
  const open = batches.filter((batch) => batch.closedAt == null).length;
  const enrolled = batches.reduce(
    (count, batch) => count + batch.enrolledCount,
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Batches</h1>
          <p className="text-muted-foreground text-sm">
            Schedules, Class Modes, and seats for this Workspace.
          </p>
        </div>
        <Button type="button" onClick={onAdd} disabled={noCourses}>
          <Plus aria-hidden="true" />
          Add Batch
        </Button>
      </div>
      <section aria-label="Batch summary" className="grid gap-3 sm:grid-cols-3">
        <CatalogStat
          label={courseId === "all" ? "Total Batches" : "Batches for Course"}
          value={
            loading || loadError ? "—" : (pagination?.total ?? batches.length)
          }
          detail="Matching current filter"
          icon={CalendarDays}
          tone="violet"
        />
        <CatalogStat
          label="Open on this page"
          value={loading || loadError ? "—" : open}
          detail="Available for Enrollments"
          icon={DoorOpen}
          tone="emerald"
        />
        <CatalogStat
          label="Enrolled on this page"
          value={loading || loadError ? "—" : enrolled}
          detail="Across visible Batches"
          icon={UsersRound}
          tone="amber"
        />
      </section>
      <section
        aria-label="Batch directory"
        className="bg-card overflow-hidden rounded-2xl border shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Batch directory</h2>
            <p className="text-muted-foreground text-xs">
              Browse schedules and manage Batches
            </p>
          </div>
          {noCourses ? null : (
            <Select
              items={courseItems}
              value={courseId}
              onValueChange={(value) => {
                if (value == null) return;
                onCourseIdChange(value);
              }}
            >
              <SelectTrigger
                id="batch-course-filter"
                size="lg"
                className="w-full max-w-sm min-w-0"
                aria-label="Filter by Course"
              >
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {courseItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {loadError ? (
          <CatalogStatus noun="Batches" error onRetry={onRetry} />
        ) : loading ? (
          <CatalogStatus noun="Batches" />
        ) : batches.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyDescription>
                {noCourses
                  ? "Add a Course before opening a Batch."
                  : "Open the first Batch this centre runs."}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {noCourses && onAddCourse != null ? (
                <Button type="button" onClick={onAddCourse}>
                  Add Course
                </Button>
              ) : (
                <Button type="button" onClick={onAdd} disabled={noCourses}>
                  Add Batch
                </Button>
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs tracking-wide uppercase">
                  Batch
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Course
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Class Mode
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Timings
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Seats
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Status
                </TableHead>
                <TableHead className="pr-6 text-right text-xs tracking-wide uppercase">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch) => {
                const closed = batch.closedAt != null;
                return (
                  <TableRow
                    key={batch.id}
                    className="h-19 hover:bg-violet-50/60 dark:hover:bg-violet-400/5"
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-700 dark:bg-sky-400/20 dark:text-sky-200"
                          aria-hidden="true"
                        >
                          {batch.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <Button
                          type="button"
                          variant="link"
                          className="text-foreground h-auto max-w-56 justify-start p-0 text-left font-semibold whitespace-normal"
                          onClick={() => {
                            onEdit(batch);
                          }}
                        >
                          {batch.name}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {courseNameById.get(batch.courseId) ?? "Course"}
                    </TableCell>
                    <TableCell>{classModeLabel(batch.classMode)}</TableCell>
                    <TableCell>{formatTimingSlots(batch.timings)}</TableCell>
                    <TableCell>
                      <span className="font-medium tabular-nums">
                        {batch.enrolledCount}/{batch.capacity}
                      </span>
                    </TableCell>
                    <TableCell>
                      {closed ? (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                        >
                          Closed
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                        >
                          Open
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onEdit(batch);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Homework and Study Material for ${batch.name}`}
                          render={
                            <Link href={`/batches/${batch.id}/homework`} />
                          }
                        >
                          Homework
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Tests for ${batch.name}`}
                          render={<Link href={`/batches/${batch.id}/tests`} />}
                        >
                          Tests
                        </Button>
                        {closed ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPendingClose(batch);
                            }}
                          >
                            Close
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {pagination != null && batches.length > 0 && !loading && !loadError ? (
          <CatalogPagination
            noun="Batches"
            count={batches.length}
            pagination={pagination}
          />
        ) : null}
      </section>
      <AlertDialog
        open={pendingClose != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingClose(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              New Enrollments cannot use {pendingClose?.name ?? "this Batch"}.
              Current Enrollments stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                if (pendingClose == null) {
                  return;
                }
                const batch = pendingClose;
                setPendingClose(null);
                void onClose(batch);
              }}
            >
              Close
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
