"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

import { fieldForCode } from "@/lib/server-errors";
import { HOLIDAY_TYPE_LABELS } from "@/src/hrms/domain/holiday";
import {
  HRMS_HOLIDAYS_KEY,
  deleteHrmsHoliday,
  hrmsHolidaysQuery,
  type HrmsHoliday,
} from "@/src/queries/hrms-holidays";

import { HolidayDialog } from "./holiday-dialog";
import { HolidayImportDialog } from "./holiday-import-dialog";
import { ConfirmDialog, HrmsEmpty, HrmsPage, RowMenu } from "./hrms-parts";

const MONTHS = Array.from({ length: 12 }, (_, index) => index);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAME = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  timeZone: "UTC",
});
const DAY_NAME = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function iso(year: number, month: number, day: number): string {
  return `${String(year)}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Twelve small months with the year's holidays marked (CM-305). */
function YearCalendar({
  year,
  holidays,
}: {
  year: number;
  holidays: readonly HrmsHoliday[];
}) {
  const byDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  return (
    <section aria-labelledby="hrms-holiday-year" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="hrms-holiday-year" className="font-semibold">
          {year} at a glance
        </h3>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="bg-primary inline-block size-3 rounded-sm" />
            Holiday
          </span>
          <span className="flex items-center gap-1.5">
            <span className="ring-primary inline-block size-3 rounded-sm ring-1 ring-inset" />
            Optional
          </span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((month) => {
          const first = new Date(Date.UTC(year, month, 1));
          const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
          // Monday first: Sunday (0) sits in the last column.
          const lead = (first.getUTCDay() + 6) % 7;
          const count = holidays.filter(
            (holiday) =>
              holiday.date.slice(0, 7) === iso(year, month, 1).slice(0, 7),
          ).length;
          return (
            <div key={month} className="bg-card rounded-xl border p-3">
              <p className="mb-2 flex items-center justify-between text-sm font-medium">
                {MONTH_NAME.format(first)}
                <span className="text-muted-foreground text-xs font-normal">
                  {count === 0
                    ? "No holidays"
                    : `${String(count)} ${count === 1 ? "holiday" : "holidays"}`}
                </span>
              </p>
              <div
                aria-hidden="true"
                className="grid grid-cols-7 gap-0.5 text-center text-xs tabular-nums"
              >
                {WEEKDAYS.map((weekday) => (
                  <span key={weekday} className="text-muted-foreground py-0.5">
                    {weekday.charAt(0)}
                  </span>
                ))}
                {Array.from({ length: lead }, (_, index) => (
                  <span key={`lead-${String(index)}`} />
                ))}
                {Array.from({ length: days }, (_, index) => {
                  const date = iso(year, month, index + 1);
                  const holiday = byDate.get(date);
                  return (
                    <span
                      key={date}
                      title={holiday?.name}
                      className={cn(
                        "rounded-sm py-0.5",
                        holiday == null
                          ? null
                          : holiday.isOptional
                            ? "ring-primary text-primary font-semibold ring-1 ring-inset"
                            : "bg-primary text-primary-foreground font-semibold",
                      )}
                    >
                      {index + 1}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HolidayYear({
  year,
  onAdd,
  onImport,
  onEdit,
  onDelete,
}: {
  year: number;
  onAdd: () => void;
  onImport: () => void;
  onEdit: (holiday: HrmsHoliday) => void;
  onDelete: (holiday: HrmsHoliday) => void;
}) {
  const { data } = useSuspenseQuery(hrmsHolidaysQuery(year));
  if (data.items.length === 0)
    return (
      <HrmsEmpty
        icon={CalendarHeart}
        title={`No holidays in ${String(year)}`}
        description="Add the national, festival and Company holidays your staff get, or import the year's list from Excel."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={onAdd}>
              <Plus aria-hidden="true" />
              Add Holiday
            </Button>
            <Button type="button" variant="outline" onClick={onImport}>
              <FileSpreadsheet aria-hidden="true" />
              Import from Excel
            </Button>
          </div>
        }
      />
    );
  return (
    <div className="space-y-6">
      <section aria-labelledby="hrms-holiday-list" className="space-y-3">
        <h3 id="hrms-holiday-list" className="font-semibold">
          {data.items.length} {data.items.length === 1 ? "holiday" : "holidays"}{" "}
          in {year}
        </h3>
        <ul
          aria-label={`Holidays in ${String(year)}`}
          className="bg-card divide-y rounded-xl border"
        >
          {data.items.map((holiday) => (
            <li key={holiday.id} className="flex items-center gap-3 px-4 py-3">
              <p className="text-muted-foreground w-24 shrink-0 text-sm tabular-nums">
                {DAY_NAME.format(new Date(`${holiday.date}T00:00:00.000Z`))}
              </p>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-medium">{holiday.name}</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    {HOLIDAY_TYPE_LABELS[holiday.type]}
                  </Badge>
                  {holiday.isOptional ? (
                    <Badge variant="outline">Optional</Badge>
                  ) : null}
                </div>
                {holiday.description == null ? null : (
                  <p className="text-muted-foreground truncate text-sm">
                    {holiday.description}
                  </p>
                )}
              </div>
              <RowMenu
                name={holiday.name}
                actions={[
                  {
                    label: "Edit",
                    onSelect: () => {
                      onEdit(holiday);
                    },
                  },
                  {
                    label: "Delete",
                    destructive: true,
                    onSelect: () => {
                      onDelete(holiday);
                    },
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      </section>
      <YearCalendar year={year} holidays={data.items} />
    </div>
  );
}

/**
 * Configuration → Holidays (CM-305): the year's holidays as a list and a
 * calendar, Add Holiday, and Import from Excel. Menu `hrms.holidays`.
 */
export function HolidaysPage({ initialYear }: { initialYear?: number }) {
  const [year, setYear] = useState(
    () => initialYear ?? new Date().getFullYear(),
  );
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<HrmsHoliday | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<HrmsHoliday | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const remove = useMutation({
    mutationFn: (id: string) => deleteHrmsHoliday(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: HRMS_HOLIDAYS_KEY });
      setDeleting(null);
    },
    onError: (error) => {
      setDeleteError(fieldForCode(error, {}).message);
    },
  });

  return (
    <HrmsPage
      wide
      title="Holidays"
      description="National, festival and Company holidays are paid days off. Optional holidays stay working days unless taken as leave."
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setImporting(true);
            }}
          >
            <FileSpreadsheet aria-hidden="true" />
            Import
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditing("new");
            }}
          >
            <Plus aria-hidden="true" />
            Add Holiday
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous year"
          onClick={() => {
            setYear((current) => current - 1);
          }}
        >
          <ChevronLeft />
        </Button>
        <p
          className="min-w-16 text-center text-lg font-semibold tabular-nums"
          aria-live="polite"
        >
          {year}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next year"
          onClick={() => {
            setYear((current) => current + 1);
          }}
        >
          <ChevronRight />
        </Button>
      </div>
      <Suspense
        fallback={
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        <HolidayYear
          year={year}
          onAdd={() => {
            setEditing("new");
          }}
          onImport={() => {
            setImporting(true);
          }}
          onEdit={setEditing}
          onDelete={(holiday) => {
            setDeleteError(undefined);
            setDeleting(holiday);
          }}
        />
      </Suspense>
      {editing == null ? null : (
        <HolidayDialog
          holiday={editing === "new" ? null : editing}
          defaultDate={`${String(year)}-01-01`}
          onClose={() => {
            setEditing(null);
          }}
        />
      )}
      {importing ? (
        <HolidayImportDialog
          year={year}
          onClose={() => {
            setImporting(false);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleting != null}
        title={`Delete ${deleting?.name ?? ""}?`}
        description="The date becomes a working day again for attendance and salary."
        confirmLabel="Delete"
        error={deleteError}
        pending={remove.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting != null) remove.mutate(deleting.id);
        }}
      />
    </HrmsPage>
  );
}
