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
}: {
  batches: BatchResponse[];
  courses: { id: string; name: string }[];
  courseId: string;
  onCourseIdChange: (courseId: string) => void;
  onAdd: () => void;
  onAddCourse?: () => void;
  onEdit: (batch: BatchResponse) => void;
  onClose: (batch: BatchResponse) => void | Promise<void>;
}) {
  const [pendingClose, setPendingClose] = useState<BatchResponse | null>(null);
  const courseItems = [
    { value: "all", label: "All Courses" },
    ...courses.map((course) => ({ value: course.id, label: course.name })),
  ];
  const courseNameById = new Map(courses.map((course) => [course.id, course.name]));
  const noCourses = courses.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl tracking-tight">Batches</h1>
        <Button type="button" onClick={onAdd} disabled={noCourses}>
          Add Batch
        </Button>
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
      {batches.length === 0 ? (
        <Empty className="border">
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
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Class Mode</TableHead>
              <TableHead>Timings</TableHead>
              <TableHead>Seats</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => {
              const closed = batch.closedAt != null;
              return (
                <TableRow key={batch.id}>
                  <TableCell className="font-medium">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        onEdit(batch);
                      }}
                    >
                      {batch.name}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {courseNameById.get(batch.courseId) ?? "Course"}
                  </TableCell>
                  <TableCell>{classModeLabel(batch.classMode)}</TableCell>
                  <TableCell>{formatTimingSlots(batch.timings)}</TableCell>
                  <TableCell>
                    {batch.enrolledCount}/{batch.capacity}
                  </TableCell>
                  <TableCell>
                    {closed ? (
                      <Badge variant="secondary">Closed</Badge>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
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
