"use client";

import { ChalkboardIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FormAlert } from "@/components/auth/form-alert";
import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { PreschoolPage } from "@/app/(app)/preschool/_components/preschool-page";
import {
  SeatsMeter,
  seatsLeftLabel,
} from "@/app/(app)/preschool/_components/seats-meter";
import { academicYearsQueryOptions } from "@/src/queries/preschool/academic-years";
import {
  archiveClassroom,
  classroomKeys,
  classroomsQueryOptions,
  createClassroom,
  updateClassroomDetails,
  type PreschoolClassroom,
} from "@/src/queries/preschool/classrooms";
import { programmesQueryOptions } from "@/src/queries/preschool/programmes";

import {
  ClassroomFormDialog,
  type ClassroomFormInput,
} from "./classroom-form-dialog";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Classrooms grouped by Programme, keeping the list's order. */
function byProgramme(
  classrooms: readonly PreschoolClassroom[],
): { programmeName: string; items: PreschoolClassroom[] }[] {
  const groups = new Map<
    string,
    { programmeName: string; items: PreschoolClassroom[] }
  >();
  for (const classroom of classrooms) {
    const group = groups.get(classroom.programmeId) ?? {
      programmeName: classroom.programmeName,
      items: [],
    };
    group.items.push(classroom);
    groups.set(classroom.programmeId, group);
  }
  return [...groups.values()];
}

function ClassroomCard({
  classroom,
  onEdit,
  onArchive,
}: {
  classroom: PreschoolClassroom;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <li className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4">
      <div className="min-w-0">
        <Link
          href={`/preschool/classrooms/${classroom.id}`}
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm font-semibold outline-none focus-visible:ring-3"
        >
          {classroom.name}
        </Link>
        <p className="text-muted-foreground truncate text-sm">
          {classroom.teachers.length === 0
            ? "No Class Teacher yet"
            : classroom.teachers.map((teacher) => teacher.name).join(", ")}
        </p>
      </div>
      <SeatsMeter
        childCount={classroom.childCount}
        capacity={classroom.capacity}
      />
      <div className="flex gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Edit ${classroom.name}`}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Archive ${classroom.name}`}
          onClick={onArchive}
        >
          Archive
        </Button>
      </div>
    </li>
  );
}

/**
 * The active Centre's Classrooms for an Academic Year (the current one by
 * default), grouped by Programme, with seats. Owner and Centre Heads.
 */
export function ClassroomsScreen() {
  const queryClient = useQueryClient();
  const { centre } = useActiveCentre();
  const { data: years } = useSuspenseQuery(academicYearsQueryOptions());
  const [yearId, setYearId] = useState<string | undefined>();
  // Keeps the shown year on screen while the next one loads.
  const [, startTransition] = useTransition();
  const { data } = useSuspenseQuery(classroomsQueryOptions(centre.id, yearId));
  const { data: programmes } = useSuspenseQuery(programmesQueryOptions());
  const [editing, setEditing] = useState<PreschoolClassroom | "new" | null>(
    null,
  );
  const [archiving, setArchiving] = useState<PreschoolClassroom | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: classroomKeys.all });
  const save = useMutation({
    mutationFn: (input: ClassroomFormInput) =>
      editing === "new" || editing == null
        ? createClassroom({
            ...input,
            centreId: centre.id,
            academicYearId: data.academicYear.id,
          })
        : updateClassroomDetails(editing.id, {
            name: input.name,
            capacity: input.capacity,
          }),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: archiveClassroom,
    onSuccess: async () => {
      setArchiving(null);
      await refresh();
    },
    onError: (failure) => {
      setArchiving(null);
      setError(
        failure instanceof Error && failure.message !== ""
          ? failure.message
          : "Could not archive this Classroom.",
      );
    },
  });

  const children = data.items.reduce((sum, item) => sum + item.childCount, 0);
  const capacity = data.items.reduce((sum, item) => sum + item.capacity, 0);
  const seatsLeft = data.items.reduce((sum, item) => sum + item.seatsLeft, 0);
  const yearItems = years.items.map((year) => ({
    value: year.id,
    label: year.isCurrent ? `${year.name} (current)` : year.name,
  }));
  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setError(null);
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Classroom
    </Button>
  );

  return (
    <PreschoolPage
      title="Classrooms"
      meta={
        data.items.length === 0
          ? `${centre.name} · ${data.academicYear.name}`
          : `${centre.name} · ${plural(children, "Child", "Children")} · ${plural(capacity, "seat", "seats")} · ${seatsLeftLabel(seatsLeft)}`
      }
      actions={
        <>
          <Select
            items={yearItems}
            value={data.academicYear.id}
            onValueChange={(value) => {
              if (value != null)
                startTransition(() => {
                  setYearId(value);
                });
            }}
          >
            <SelectTrigger aria-label="Academic Year" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              {yearItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.items.length === 0 ? null : addButton}
        </>
      }
    >
      <FormAlert message={error ?? undefined} />
      {data.items.length === 0 ? (
        <EmptyState
          className="border"
          icon={ChalkboardIcon}
          tone="amber"
          title={`No Classrooms in ${data.academicYear.name}`}
          description="Add a Classroom for each section of a Programme, such as Nursery A."
          actions={addButton}
        />
      ) : (
        byProgramme(data.items).map((group) => (
          <section
            key={group.programmeName}
            aria-label={group.programmeName}
            className="space-y-3"
          >
            <h2 className="text-lg font-semibold">{group.programmeName}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((classroom) => (
                <ClassroomCard
                  key={classroom.id}
                  classroom={classroom}
                  onEdit={() => {
                    setError(null);
                    setEditing(classroom);
                  }}
                  onArchive={() => {
                    setError(null);
                    setArchiving(classroom);
                  }}
                />
              ))}
            </ul>
          </section>
        ))
      )}
      <ClassroomFormDialog
        open={editing != null}
        classroom={editing === "new" ? null : editing}
        programmes={programmes.items}
        academicYearName={data.academicYear.name}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSubmit={async (input) => {
          await save.mutateAsync(input);
        }}
      />
      <AlertDialog
        open={archiving != null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves this list and takes no new Admissions. A Classroom with
              Children cannot be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={archive.isPending}
              onClick={() => {
                if (archiving != null) archive.mutate(archiving.id);
              }}
            >
              Archive Classroom
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PreschoolPage>
  );
}
