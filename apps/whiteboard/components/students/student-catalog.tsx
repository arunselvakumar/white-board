"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ContactRound,
  Plus,
  Search,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import { Spinner } from "@repo/ui/components/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import type { StudentResponse } from "@/src/queries/students";
import { StudentAvatar } from "@/components/students/student-avatar";

function admittedDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

type StudentPagination = {
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
};

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | null;
  detail: string;
  icon: typeof UsersRound;
  tone: "violet" | "emerald" | "amber";
}) {
  const styles = {
    violet:
      "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-400/10 dark:text-violet-200 dark:ring-violet-400/20",
    emerald:
      "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-200 dark:ring-emerald-400/20",
    amber:
      "bg-amber-50 text-amber-800 ring-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/20",
  }[tone];

  return (
    <article className="bg-card flex items-start justify-between gap-4 rounded-2xl border p-5 shadow-sm">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">{label}</p>
        {value == null ? (
          <Skeleton className="h-9 w-16" />
        ) : (
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {value}
          </p>
        )}
        <p className="text-muted-foreground text-xs">{detail}</p>
      </div>
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ${styles}`}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
    </article>
  );
}

export function StudentCatalog({
  students,
  loading = false,
  updating = false,
  loadError = false,
  onRetry,
  search,
  onSearchChange,
  onAdd,
  onView,
  onEdit,
  onDrop,
  pagination,
}: {
  students: StudentResponse[];
  loading?: boolean;
  updating?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: () => void;
  onView: (student: StudentResponse) => void;
  onEdit: (student: StudentResponse) => void;
  onDrop: (student: StudentResponse) => void | Promise<void>;
  pagination?: StudentPagination;
}) {
  const [pendingDrop, setPendingDrop] = useState<StudentResponse | null>(null);
  const emptyBecauseSearch = search.trim().length > 0 && students.length === 0;
  const activeOnPage = students.filter(
    (student) => student.droppedAt == null,
  ).length;
  const guardianContacts = students.filter(
    (student) => student.guardianPhone != null,
  ).length;
  const total = pagination?.total ?? students.length;
  const first =
    total === 0
      ? 0
      : ((pagination?.page ?? 1) - 1) *
          (pagination?.pageSize ?? students.length) +
        1;
  const last = Math.min(first + students.length - 1, total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
          <p className="text-muted-foreground text-sm">
            Student records and Guardian contacts for this Workspace.
          </p>
        </div>
        <Button type="button" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Add Student
        </Button>
      </div>
      <section
        aria-label="Student summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        <SummaryCard
          label={search.trim() ? "Students found" : "Total Students"}
          value={loading || loadError ? null : total}
          detail={search.trim() ? "Matching this search" : "In this Workspace"}
          icon={UsersRound}
          tone="violet"
        />
        <SummaryCard
          label="Active on this page"
          value={loading || loadError ? null : activeOnPage}
          detail="Current page"
          icon={UserRoundCheck}
          tone="emerald"
        />
        <SummaryCard
          label="Guardian contacts"
          value={loading || loadError ? null : guardianContacts}
          detail="On this page"
          icon={ContactRound}
          tone="amber"
        />
      </section>
      <section
        aria-label="Student directory"
        className="bg-card overflow-hidden rounded-2xl border shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b p-4 sm:px-6">
          <div>
            <h2 className="font-semibold">Student directory</h2>
            <p className="text-muted-foreground text-xs">
              Browse and manage Student records
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id="student-search"
              className="h-10 pl-9"
              placeholder="Search by name or phone"
              value={search}
              onChange={(event) => {
                onSearchChange(event.target.value);
              }}
              aria-label="Search by name or phone"
            />
          </div>
        </div>
        {updating ? (
          <div
            className="text-muted-foreground flex items-center gap-2 border-b px-6 py-2 text-xs"
            role="status"
          >
            <Spinner className="size-4" aria-hidden="true" />
            Updating Students…
          </div>
        ) : null}
        {loading ? (
          <div aria-busy="true">
            <div
              className="text-muted-foreground flex items-center gap-2 px-6 py-3 text-sm"
              role="status"
            >
              <Spinner className="size-4" aria-hidden="true" />
              Loading Students…
            </div>
            <Table aria-label="Loading Students">
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Guardian</TableHead>
                  <TableHead>Admitted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[0, 1, 2, 3].map((row) => (
                  <TableRow key={row} aria-hidden="true">
                    <TableCell>
                      <Skeleton className="h-10 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-7 w-24" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-start gap-3 p-6" role="alert">
            <p>Could not load Students. Please try again.</p>
            {onRetry == null ? null : (
              <Button type="button" variant="outline" onClick={onRetry}>
                Retry
              </Button>
            )}
          </div>
        ) : students.length === 0 ? (
          <Empty className="border-0">
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
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 text-xs tracking-wide uppercase">
                  Student
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Guardian
                </TableHead>
                <TableHead className="text-xs tracking-wide uppercase">
                  Admitted
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
              {students.map((student) => {
                const dropped = student.droppedAt != null;
                return (
                  <TableRow
                    key={student.id}
                    className="h-19 hover:bg-violet-50/60 dark:hover:bg-violet-400/5"
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <StudentAvatar
                          studentId={student.id}
                          name={student.name}
                          photoUrl={student.photoUrl}
                          className="size-10"
                        />
                        <div className="min-w-0">
                          <Button
                            type="button"
                            variant="link"
                            className="text-foreground h-auto max-w-full justify-start p-0 text-left font-semibold"
                            onClick={() => {
                              onView(student);
                            }}
                          >
                            <span className="truncate">{student.name}</span>
                          </Button>
                          <p className="text-muted-foreground text-xs">
                            {student.phone}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {student.guardianName ?? "—"}
                      </p>
                      {student.guardianPhone == null ? null : (
                        <p className="text-muted-foreground text-xs">
                          {student.guardianPhone}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {admittedDate(student.createdAt)}
                    </TableCell>
                    <TableCell>
                      {dropped ? (
                        <Badge
                          variant="outline"
                          className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                        >
                          Dropped
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
                      <div className="flex justify-end gap-1">
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
        {pagination != null && students.length > 0 && !loading && !loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-6">
            <p className="text-muted-foreground text-sm">
              Showing {first}–{last} of {total} Students
            </p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground mr-2 text-xs">
                Page {pagination.page} of{" "}
                {Math.ceil(total / pagination.pageSize)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.hasPrevious}
                onClick={pagination.onPrevious}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.hasNext}
                onClick={pagination.onNext}
                aria-label="Next page"
              >
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>
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
