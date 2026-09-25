"use client";

import { useState } from "react";
import { BookOpen, BookOpenCheck, FolderClosed, Plus } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { formatPaiseAsRupees } from "@/lib/money";
import {
  CatalogPagination,
  CatalogStat,
  CatalogStatus,
  type CatalogPaginationProps,
} from "@/components/catalog/catalog-chrome";
import type { CourseResponse } from "@/src/queries/courses";

export function CourseCatalog({
  courses,
  onAdd,
  onEdit,
  onArchive,
  pagination,
  loading = false,
  loadError = false,
  onRetry,
}: {
  courses: CourseResponse[];
  onAdd: () => void;
  onEdit: (course: CourseResponse) => void;
  onArchive: (course: CourseResponse) => void | Promise<void>;
  pagination?: CatalogPaginationProps;
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
}) {
  const [pendingArchive, setPendingArchive] = useState<CourseResponse | null>(
    null,
  );

  const active = courses.filter((course) => course.archivedAt == null).length;
  const categories = new Set(
    courses.map((course) => course.category).filter(Boolean),
  ).size;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Courses</h1>
          <p className="text-muted-foreground text-sm">
            Manage what this centre teaches.
          </p>
        </div>
        <Button type="button" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Add Course
        </Button>
      </div>
      <section
        aria-label="Course summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        <CatalogStat
          label="Total Courses"
          value={
            loading || loadError ? "—" : (pagination?.total ?? courses.length)
          }
          detail="In this Workspace"
          icon={BookOpen}
          tone="violet"
        />
        <CatalogStat
          label="Active on this page"
          value={loading || loadError ? "—" : active}
          detail="Available for new Batches"
          icon={BookOpenCheck}
          tone="emerald"
        />
        <CatalogStat
          label="Categories on this page"
          value={loading || loadError ? "—" : categories}
          detail="Across visible Courses"
          icon={FolderClosed}
          tone="amber"
        />
      </section>
      <section
        aria-label="Course catalog"
        className="bg-card overflow-hidden rounded-2xl border shadow-sm"
      >
        <div className="border-b p-4 sm:px-6">
          <h2 className="font-semibold">Course catalog</h2>
          <p className="text-muted-foreground text-xs">
            Browse and manage Courses
          </p>
        </div>
        {loadError ? (
          <CatalogStatus noun="Courses" error onRetry={onRetry} />
        ) : loading ? (
          <CatalogStatus noun="Courses" />
        ) : courses.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyDescription>
                Add the first Course this centre teaches.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={onAdd}>
                Add Course
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs tracking-wide uppercase">
                  Course
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Duration
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Default fee
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
              {courses.map((course) => {
                const archived = course.archivedAt != null;
                return (
                  <TableRow
                    key={course.id}
                    className="h-19 hover:bg-violet-50/60 dark:hover:bg-violet-400/5"
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700 dark:bg-violet-400/20 dark:text-violet-200"
                          aria-hidden="true"
                        >
                          {course.name.trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Button
                            type="button"
                            variant="link"
                            className="text-foreground h-auto max-w-full justify-start p-0 text-left font-semibold"
                            onClick={() => {
                              onEdit(course);
                            }}
                          >
                            {course.name}
                          </Button>
                          {course.code ? (
                            <span className="text-muted-foreground block text-xs">
                              {course.code}
                            </span>
                          ) : course.category ? (
                            <span className="text-muted-foreground block text-xs">
                              {course.category}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {course.duration.kind === "flexible"
                        ? "Flexible"
                        : `${course.duration.value} ${course.duration.unit}`}
                    </TableCell>
                    <TableCell>
                      {formatPaiseAsRupees(course.defaultFeeAmountPaise)}
                    </TableCell>
                    <TableCell>
                      {archived ? (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                        >
                          Archived
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                        >
                          Active
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
                            onEdit(course);
                          }}
                        >
                          Edit
                        </Button>
                        {archived ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPendingArchive(course);
                            }}
                          >
                            Archive
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
        {pagination != null && courses.length > 0 && !loading && !loadError ? (
          <CatalogPagination
            noun="Courses"
            count={courses.length}
            pagination={pagination}
          />
        ) : null}
      </section>
      <AlertDialog
        open={pendingArchive != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingArchive(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this Course?</AlertDialogTitle>
            <AlertDialogDescription>
              New Batches cannot use {pendingArchive?.name ?? "this Course"}.
              Past Enrollments stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                if (pendingArchive == null) {
                  return;
                }
                const course = pendingArchive;
                setPendingArchive(null);
                void onArchive(course);
              }}
            >
              Archive
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
