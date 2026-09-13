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
import { Input } from "@repo/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import type { StudentResponse } from "@/src/queries/students";

export function StudentCatalog({
  students,
  search,
  onSearchChange,
  onAdd,
  onEdit,
  onDrop,
}: {
  students: StudentResponse[];
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  onEdit: (student: StudentResponse) => void;
  onDrop: (student: StudentResponse) => void | Promise<void>;
}) {
  const [pendingDrop, setPendingDrop] = useState<StudentResponse | null>(null);
  const emptyBecauseSearch = search.trim().length > 0 && students.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl tracking-tight">Students</h1>
        <Button type="button" onClick={onAdd}>
          Add Student
        </Button>
      </div>
      <Input
        id="student-search"
        className="h-10 max-w-sm"
        placeholder="Search by name or phone"
        value={search}
        onChange={(event) => {
          onSearchChange(event.target.value);
        }}
        aria-label="Search by name or phone"
      />
      {students.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              {emptyBecauseSearch
                ? "No Students match that search."
                : "Add the first Student this centre admits."}
            </EmptyDescription>
          </EmptyHeader>
          {emptyBecauseSearch ? null : (
            <EmptyContent>
              <Button type="button" onClick={onAdd}>
                Add Student
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Guardian</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => {
              const dropped = student.droppedAt != null;
              return (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => {
                        onEdit(student);
                      }}
                    >
                      {student.name}
                    </Button>
                  </TableCell>
                  <TableCell>{student.phone}</TableCell>
                  <TableCell>{student.guardianName ?? "—"}</TableCell>
                  <TableCell>
                    {dropped ? (
                      <Badge variant="secondary">Dropped</Badge>
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
                          onEdit(student);
                        }}
                      >
                        Edit
                      </Button>
                      {dropped ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPendingDrop(student);
                          }}
                        >
                          Drop
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
        open={pendingDrop != null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDrop(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Drop this Student?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDrop?.name ?? "This Student"} leaves the active register.
              History stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                if (pendingDrop == null) {
                  return;
                }
                const student = pendingDrop;
                setPendingDrop(null);
                void onDrop(student);
              }}
            >
              Drop
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
