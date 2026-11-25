"use client";

import { CalendarBlankIcon } from "@phosphor-icons/react/ssr";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import { EmptyState } from "@repo/ui/components/empty-state";

import { FormAlert } from "@/components/auth/form-alert";
import { useActiveCentre } from "@/app/(app)/preschool/_components/active-centre-provider";
import { nextAcademicYear } from "@/src/preschool/domain/academic-year";
import {
  academicYearsQueryOptions,
  createNextAcademicYear,
  makeAcademicYearCurrent,
  type PreschoolAcademicYear,
} from "@/src/queries/preschool/academic-years";
import { preschoolKeys } from "@/src/queries/preschool/me";

/** "1 Apr 2026" */
export function formatIndianDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function span(year: { startsOn: string; endsOn: string }): string {
  return `${formatIndianDate(year.startsOn)} – ${formatIndianDate(year.endsOn)}`;
}

type Confirming =
  { kind: "next" } | { kind: "current"; year: PreschoolAcademicYear };

/**
 * Academic Years, newest first, the current one marked. The next year is
 * shown with its name and dates before it is added; making a year current
 * is confirmed, since Classrooms and Admissions belong to a year.
 */
export function AcademicYearList() {
  const queryClient = useQueryClient();
  const { me } = useActiveCentre();
  const { data } = useSuspenseQuery(academicYearsQueryOptions());
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = async () => {
    setConfirming(null);
    await queryClient.invalidateQueries({ queryKey: preschoolKeys.all });
  };
  const fail = (failure: unknown) => {
    setConfirming(null);
    setError(
      failure instanceof Error && failure.message !== ""
        ? failure.message
        : "Could not change the Academic Year. Please try again.",
    );
  };
  const addNext = useMutation({
    mutationFn: createNextAcademicYear,
    onSuccess: done,
    onError: fail,
  });
  const makeCurrent = useMutation({
    mutationFn: makeAcademicYearCurrent,
    onSuccess: done,
    onError: fail,
  });

  const latest = data.items[0];
  const next =
    latest == null
      ? null
      : nextAcademicYear(latest.startsOn, me.academicYearStartMonth);
  const pending = addNext.isPending || makeCurrent.isPending;

  return (
    <section aria-labelledby="academic-years-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="academic-years-heading" className="text-lg font-semibold">
            Academic Years
          </h2>
          <p className="text-muted-foreground text-sm">
            Classrooms, Admissions and fees belong to one Academic Year.
          </p>
        </div>
        {next == null ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setError(null);
              setConfirming({ kind: "next" });
            }}
          >
            <Plus aria-hidden="true" />
            Add next Academic Year
          </Button>
        )}
      </div>
      <FormAlert message={error ?? undefined} />
      {data.items.length === 0 ? (
        <EmptyState
          className="border"
          size="md"
          icon={CalendarBlankIcon}
          tone="teal"
          title="No Academic Year yet"
          description="Setting up the Preschool adds the current Academic Year."
        />
      ) : (
        <ul className="divide-y rounded-xl border">
          {data.items.map((year) => (
            <li
              key={year.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {year.name}
                  {year.isCurrent ? <Badge>Current</Badge> : null}
                </p>
                <p className="text-muted-foreground text-sm">{span(year)}</p>
              </div>
              {year.isCurrent ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Make ${year.name} current`}
                  onClick={() => {
                    setError(null);
                    setConfirming({ kind: "current", year });
                  }}
                >
                  Make current
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <AlertDialog
        open={confirming != null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          {confirming?.kind === "next" && next != null ? (
            <AlertDialogHeader>
              <AlertDialogTitle>
                Add Academic Year {next.name}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {span(next)}. The current year does not change until you make
                this one current.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : confirming?.kind === "current" ? (
            <AlertDialogHeader>
              <AlertDialogTitle>
                Make {confirming.year.name} current?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Classrooms and Admissions belong to one Academic Year. Screens
                will open {confirming.year.name} by default; Classrooms and
                Admissions of other years stay as they are.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirming?.kind === "next") addNext.mutate();
                else if (confirming?.kind === "current")
                  makeCurrent.mutate(confirming.year.id);
              }}
            >
              {confirming?.kind === "next" ? "Add year" : "Make current"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
