"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@repo/ui/components/button";

import { formatDate } from "@/components/payments/payment-format";
import {
  worksheetAttendanceQuery,
  type WorksheetAttendance,
} from "@/src/queries/worksheets";

/**
 * "Attendance on <date>" beside the headcounts (CM-0016 §6): the
 * Project's attendance by skill, the heads already on its other
 * worksheets that date, and what remains. **Use remaining** fills the
 * two counts; the difference is shown, not enforced.
 */
export function WorksheetAttendancePanel({
  projectId,
  date,
  excludeId,
  onUseRemaining,
}: {
  projectId: string;
  date: string;
  /** The sheet being edited, left out of "on other worksheets". */
  excludeId: string | null;
  onUseRemaining: (remaining: WorksheetAttendance["remaining"]) => void;
}) {
  const { data, isPending, isError } = useQuery(
    worksheetAttendanceQuery(projectId, date, excludeId),
  );
  const title = `Attendance on ${formatDate(date)}`;
  if (isPending)
    return (
      <p className="text-muted-foreground rounded-lg border p-3 text-sm">
        Loading attendance…
      </p>
    );
  if (isError)
    return (
      <p className="text-muted-foreground rounded-lg border p-3 text-sm">
        Attendance could not be loaded.
      </p>
    );
  const rows = [
    { label: "Attendance", value: data.attendance },
    { label: "On other worksheets", value: data.onWorksheets },
    { label: "Remaining", value: data.remaining },
  ];
  const nothing = data.remaining.skilled + data.remaining.unskilled === 0;
  return (
    <section
      aria-label={title}
      className="bg-muted/40 space-y-2 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={nothing}
          onClick={() => {
            onUseRemaining(data.remaining);
          }}
        >
          Use remaining
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th scope="col" className="text-left font-normal">
              <span className="sr-only">Heads</span>
            </th>
            <th scope="col" className="text-right font-normal">
              Skilled
            </th>
            <th scope="col" className="text-right font-normal">
              Unskilled
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="py-0.5 text-left font-normal">
                {row.label}
              </th>
              <td className="text-right tabular-nums">{row.value.skilled}</td>
              <td className="text-right tabular-nums">{row.value.unskilled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
