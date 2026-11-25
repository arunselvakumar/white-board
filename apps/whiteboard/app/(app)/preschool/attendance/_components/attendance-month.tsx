"use client";

import { BabyIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { cn } from "@repo/ui/lib/utils";

import { addMonths } from "@/src/preschool/domain/dates";
import {
  preschoolAttendanceMonthQueryOptions,
  type PreschoolAttendanceStatus,
} from "@/src/queries/preschool/attendance";

const LETTER: Record<PreschoolAttendanceStatus, string> = {
  present: "P",
  absent: "A",
  leave: "L",
};

const CELL: Record<PreschoolAttendanceStatus, string> = {
  present:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300",
  absent: "bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-300",
  leave: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300",
};

/** The register prints on its own: landscape, without the app around it. */
const PRINT_CSS = `
@page { size: A4 landscape; margin: 10mm; }
@media print {
  [data-slot="sidebar"],
  [data-slot="sidebar-gap"],
  [data-slot="sidebar-container"] { display: none !important; }
  [data-slot="sidebar-wrapper"] { display: block !important; min-height: 0 !important; }
  [data-slot="sidebar-inset"] { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
  html, body { background: #fff !important; }
  .attendance-register { font-size: 8pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .attendance-register [data-register-scroll] { overflow: visible !important; }
  .attendance-register th, .attendance-register td { position: static !important; }
}
`;

/** "November 2026" */
export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A Classroom's monthly register: Children down the side, days across, P / A
 * / L in each cell and totals per Child. The grid scrolls sideways in its own
 * box with the names fixed.
 */
export function AttendanceMonth({
  classroomId,
  month,
  currentMonth,
  onMonthChange,
}: {
  classroomId: string;
  /** "YYYY-MM" */
  month: string;
  currentMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const { data } = useSuspenseQuery(
    preschoolAttendanceMonthQueryOptions(classroomId, month),
  );
  const shift = (by: number) => addMonths(`${month}-01`, by).slice(0, 7);

  return (
    <section
      aria-label="Monthly register"
      className="attendance-register space-y-4"
    >
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Previous month"
          onClick={() => {
            onMonthChange(shift(-1));
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p aria-live="polite" className="min-w-36 text-center font-medium">
          {formatMonth(month)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Next month"
          disabled={month >= currentMonth}
          onClick={() => {
            onMonthChange(shift(1));
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="ml-auto h-11"
          onClick={() => {
            window.print();
          }}
        >
          <Printer aria-hidden="true" />
          Print
        </Button>
      </div>
      <div>
        <h2 className="text-lg font-semibold">
          {data.classroom.name} · {formatMonth(month)}
        </h2>
        <p className="text-muted-foreground text-sm">
          {data.classroom.programmeName} · {data.workingDays} working{" "}
          {data.workingDays === 1 ? "day" : "days"}
        </p>
      </div>
      {data.children.length === 0 ? (
        <EmptyState
          className="border"
          size="md"
          icon={BabyIcon}
          tone="violet"
          title="No Children in this Classroom"
          description="The register fills in as Children are admitted and marked."
        />
      ) : (
        <div
          data-register-scroll
          tabIndex={0}
          role="region"
          aria-label="Register grid"
          className="max-w-full overflow-x-auto rounded-xl border"
        >
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-muted/60">
                <th
                  scope="col"
                  className="bg-muted sticky left-0 z-10 min-w-36 px-3 py-2 text-left font-medium"
                >
                  Child
                </th>
                {data.days.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    className="w-7 min-w-7 px-0.5 py-2 text-center font-medium tabular-nums"
                  >
                    {Number(day.slice(8))}
                  </th>
                ))}
                {(["P", "A", "L"] as const).map((total) => (
                  <th
                    key={total}
                    scope="col"
                    className="min-w-8 border-l px-1 py-2 text-center font-semibold"
                  >
                    {total}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.children.map((child) => (
                <tr key={child.childId} className="border-t">
                  <th
                    scope="row"
                    className="bg-card sticky left-0 z-10 max-w-44 truncate px-3 py-1.5 text-left font-medium"
                  >
                    {child.name}
                  </th>
                  {child.days.map((status, index) => (
                    <td
                      key={data.days[index] ?? index}
                      className={cn(
                        "h-8 text-center font-semibold",
                        status == null
                          ? "text-muted-foreground/40"
                          : CELL[status],
                      )}
                    >
                      {status == null ? "·" : LETTER[status]}
                    </td>
                  ))}
                  <td className="border-l text-center font-semibold tabular-nums">
                    {child.totals.present}
                  </td>
                  <td className="text-center tabular-nums">
                    {child.totals.absent}
                  </td>
                  <td className="text-center tabular-nums">
                    {child.totals.leave}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        P Present · A Absent · L Leave · a dot is not marked.
      </p>
    </section>
  );
}
