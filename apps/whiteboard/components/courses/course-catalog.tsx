"use client";

import { useState } from "react";
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
import type { CourseResponse } from "@/src/queries/courses";

export function CourseCatalog({
  courses,
  onAdd,
  onEdit,
  onArchive,
}: {
  courses: CourseResponse[];
  onAdd: () => void;
  onEdit: (course: CourseResponse) => void;
  onArchive: (course: CourseResponse) => void | Promise<void>;
}) {
  const [pendingArchive, setPendingArchive] = useState<CourseResponse | null>(
    null,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl tracking-tight">Courses</h1>
        <Button type="button" onClick={onAdd}>
          Add Course
        </Button>
      </div>
      {courses.length === 0 ? (
        <Empty className="border">
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
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Default fee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.map((course) => {
              const archived = course.archivedAt != null;
              return (
                <TableRow key={course.id}>
                  <TableCell className="font-medium">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        onEdit(course);
                      }}
                    >
                      {course.name}
                    </Button>
                  </TableCell>
                  <TableCell>{course.duration}</TableCell>
                  <TableCell>
                    {formatPaiseAsRupees(course.defaultFeeAmountPaise)}
                  </TableCell>
                  <TableCell>
                    {archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
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
