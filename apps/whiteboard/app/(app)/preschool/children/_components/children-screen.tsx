"use client";

import { BabyIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/preschool/_components/table-card";

import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import { PhoneLinks } from "@/app/(app)/preschool/_components/phone-links";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  PRESCHOOL_CHILD_STATUS_LABELS,
  preschoolChildrenQueryOptions,
  type PreschoolChild,
  type PreschoolChildStatus,
} from "@/src/queries/preschool/children";
import { classroomsQueryOptions } from "@/src/queries/preschool/classrooms";

const PAGE_SIZE = 25;

type StatusFilter = PreschoolChildStatus | "all";

type Filters = {
  q: string;
  classroomId: string;
  status: StatusFilter;
  /** Cursors of the pages before this one; the last is this page's. */
  cursors: string[];
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "graduated", label: "Graduated" },
  { value: "all", label: "Every status" },
];

const ALL_CLASSROOMS = "all";

function parentPhone(child: PreschoolChild) {
  const phone = child.motherPhone ?? child.fatherPhone;
  if (phone == null) return null;
  const name = child.motherPhone == null ? child.fatherName : child.motherName;
  return { phone, name: name ?? undefined };
}

function ChildName({ child }: { child: PreschoolChild }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ChildAvatar
        childId={child.id}
        name={child.name}
        photoUrl={child.photoUrl}
        className="size-9"
      />
      <div className="min-w-0">
        <Link
          href={`/preschool/children/${child.id}`}
          className="block truncate font-medium underline-offset-4 hover:underline"
        >
          {child.name}
        </Link>
        <p className="text-muted-foreground text-xs tabular-nums">
          {child.admissionNumber} · {child.ageText}
        </p>
      </div>
    </div>
  );
}

function ChildRows({
  centreId,
  filters,
  canAdmit,
  onPage,
}: {
  centreId: string;
  filters: Filters;
  canAdmit: boolean;
  onPage: (cursors: string[]) => void;
}) {
  const { data } = useSuspenseQuery(
    preschoolChildrenQueryOptions({
      centreId,
      classroomId:
        filters.classroomId === ALL_CLASSROOMS
          ? undefined
          : filters.classroomId,
      status: filters.status,
      q: filters.q.trim() === "" ? undefined : filters.q.trim(),
      limit: PAGE_SIZE,
      cursor: filters.cursors.at(-1),
    }),
  );
  const filtered =
    filters.q.trim() !== "" ||
    filters.classroomId !== ALL_CLASSROOMS ||
    filters.status !== "active";
  if (data.items.length === 0)
    return filtered ? (
      <EmptyState
        size="sm"
        className="border"
        icon={MagnifyingGlassIcon}
        tone="neutral"
        title="No Children match"
        description="Try another search, Classroom or status."
      />
    ) : (
      <EmptyState
        className="border"
        icon={BabyIcon}
        tone="violet"
        title="No Children yet"
        description={
          canAdmit
            ? "Admit a Child from the admission form, or from an Enquiry."
            : "Children admitted to your Classrooms appear here."
        }
        actions={
          canAdmit ? (
            <Link href="/preschool/children/new" className={buttonVariants()}>
              <Plus aria-hidden="true" />
              Admit a Child
            </Link>
          ) : undefined
        }
      />
    );
  const first = filters.cursors.length * PAGE_SIZE + 1;
  return (
    <div className="space-y-3">
      <ul className="space-y-2 md:hidden" aria-label="Children">
        {data.items.map((child) => {
          const contact = parentPhone(child);
          return (
            <li
              key={child.id}
              className="bg-card space-y-2 rounded-xl border p-3 text-sm"
            >
              <ChildName child={child} />
              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>{child.classroomName ?? "No Classroom"}</span>
                {child.status === "active" ? null : (
                  <Badge variant="outline">
                    {PRESCHOOL_CHILD_STATUS_LABELS[child.status]}
                  </Badge>
                )}
              </div>
              {contact == null ? null : (
                <PhoneLinks phone={contact.phone} label={contact.name} />
              )}
            </li>
          );
        })}
      </ul>
      <TableCard className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Child</TableHead>
              <TableHead>Classroom</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((child) => {
              const contact = parentPhone(child);
              return (
                <TableRow key={child.id}>
                  <TableCell className="min-w-56">
                    <ChildName child={child} />
                  </TableCell>
                  <TableCell>
                    {child.classroomName ?? "—"}
                    {child.programmeName == null ? null : (
                      <p className="text-muted-foreground text-xs">
                        {child.programmeName}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="min-w-44">
                    {contact == null ? (
                      "—"
                    ) : (
                      <>
                        <p>{contact.name}</p>
                        <PhoneLinks
                          phone={contact.phone}
                          label={contact.name}
                        />
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        child.status === "active" ? "secondary" : "outline"
                      }
                    >
                      {PRESCHOOL_CHILD_STATUS_LABELS[child.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableCard>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground tabular-nums">
          {first}–{first + data.items.length - 1} of {data.total}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={filters.cursors.length === 0}
            onClick={() => {
              onPage(filters.cursors.slice(0, -1));
            }}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null)
                onPage([...filters.cursors, data.nextCursor]);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The Centre's Children. A Teacher sees only their Classrooms and cannot
 * admit; the list and the API agree.
 */
export function ChildrenScreen() {
  const { centre, me } = useActiveCentre();
  const canAdmit = me.role === "owner" || me.role === "centre_head";
  const [filters, setFilters] = useState<Filters>({
    q: "",
    classroomId: ALL_CLASSROOMS,
    status: "active",
    cursors: [],
  });
  const shown = useDeferredValue(filters);
  const { data: classrooms } = useQuery(classroomsQueryOptions(centre.id));
  const classroomOptions = [
    { value: ALL_CLASSROOMS, label: "Every Classroom" },
    ...(classrooms?.items ?? [])
      .filter(
        (room) => me.role !== "teacher" || me.classroomIds.includes(room.id),
      )
      .map((room) => ({ value: room.id, label: room.name })),
  ];
  const change = (next: Partial<Filters>) => {
    setFilters((current) => ({ ...current, cursors: [], ...next }));
  };

  return (
    <PreschoolPage
      title="Children"
      watermark="Children"
      actions={
        canAdmit ? (
          <Link href="/preschool/children/new" className={buttonVariants()}>
            <Plus aria-hidden="true" />
            Admit a Child
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          type="search"
          aria-label="Search Children"
          placeholder="Search name, admission number or phone"
          className="h-9 sm:max-w-xs"
          value={filters.q}
          onChange={(event) => {
            change({ q: event.target.value });
          }}
        />
        <Select
          items={classroomOptions}
          value={filters.classroomId}
          onValueChange={(value) => {
            if (value != null) change({ classroomId: value });
          }}
        >
          <SelectTrigger
            aria-label="Classroom"
            className="w-full min-w-0 sm:w-48"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {classroomOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={STATUS_OPTIONS}
          value={filters.status}
          onValueChange={(value) => {
            if (value != null) change({ status: value });
          }}
        >
          <SelectTrigger aria-label="Status" className="w-full min-w-0 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        <ChildRows
          centreId={centre.id}
          filters={shown}
          canAdmit={canAdmit}
          onPage={(cursors) => {
            setFilters((current) => ({ ...current, cursors }));
          }}
        />
      </Suspense>
    </PreschoolPage>
  );
}
