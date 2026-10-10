"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarDays, Download } from "lucide-react";
import { useState } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import {
  hrmsAttendanceMonthQuery,
  hrmsAttendanceReportUrl,
  type HrmsAttendanceDay,
} from "@/src/queries/hrms-attendance";

import {
  AttendanceRead,
  DAY_STATUS_LABELS,
  DAY_STATUS_LETTERS,
  DAY_STATUS_TEXT,
  hoursText,
} from "./attendance-parts";
import { HrmsEmpty, HrmsPage } from "./hrms-parts";

/** One focusable scroll area around the wide grid. */
const SCROLL =
  "focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [contain:inline-size] [&>[data-slot=table-container]]:overflow-visible";

function code(day: HrmsAttendanceDay): string {
  return day.status === "on_leave" && day.leave?.half === true
    ? "½L"
    : DAY_STATUS_LETTERS[day.status];
}

function Grid({ month }: { month: string }) {
  const { data } = useSuspenseQuery(hrmsAttendanceMonthQuery(month));
  if (data.rows.length === 0)
    return (
      <HrmsEmpty
        icon={CalendarDays}
        title="No Team Members yet"
        description="Add Team Members in Masters → Team Members. Once they join the Company they appear here with their month."
      />
    );
  const dates = data.rows[0]?.days.map((day) => day.date) ?? [];
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        P Present · HD Half Day · A Absent · L Leave (½L half a day) · H Holiday
        · WO Week Off · a dot under the letter is a late check-in.
        {data.month === data.today.slice(0, 7)
          ? " Days after today are blank and not counted."
          : null}
      </p>
      <div
        role="region"
        aria-label="Attendance by day, scrolls sideways"
        tabIndex={0}
        className={SCROLL}
      >
        <Table aria-label="Attendance by day">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 min-w-36">
                Team Member
              </TableHead>
              {dates.map((date) => (
                <TableHead key={date} className="px-1 text-center tabular-nums">
                  {Number(date.slice(8))}
                </TableHead>
              ))}
              <TableHead className="text-right">P</TableHead>
              <TableHead className="text-right">HD</TableHead>
              <TableHead className="text-right">A</TableHead>
              <TableHead className="text-right">L</TableHead>
              <TableHead className="text-right">H</TableHead>
              <TableHead className="text-right">WO</TableHead>
              <TableHead className="text-right">Late</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">OT h</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => {
              const c = row.counts;
              return (
                <TableRow
                  key={row.member.memberId}
                  aria-label={row.member.name}
                >
                  <TableHead
                    scope="row"
                    className="bg-background sticky left-0 font-medium"
                  >
                    {row.member.name}
                  </TableHead>
                  {row.days.map((day) => {
                    const future = day.date > data.today;
                    return (
                      <TableCell
                        key={day.date}
                        className="px-1 text-center text-xs font-semibold whitespace-nowrap"
                        title={
                          future
                            ? undefined
                            : `${DAY_STATUS_LABELS[day.status]}${day.workedHours > 0 ? `, ${hoursText(day.workedHours)}` : ""}${day.late ? ", late" : ""}`
                        }
                        aria-label={
                          future
                            ? undefined
                            : `${row.member.name} ${day.date} ${DAY_STATUS_LABELS[day.status]}`
                        }
                      >
                        {future ? null : (
                          <>
                            <span className={cn(DAY_STATUS_TEXT[day.status])}>
                              {code(day)}
                            </span>
                            {day.late ? (
                              <span
                                aria-hidden="true"
                                className="bg-chart-4 mx-auto mt-0.5 block size-1 rounded-full"
                              />
                            ) : null}
                          </>
                        )}
                      </TableCell>
                    );
                  })}
                  {[
                    c.present,
                    c.halfDays,
                    c.absent,
                    c.paidLeave + c.unpaidLeave,
                    c.holidays,
                    c.weekOff,
                    c.late,
                  ].map((value, index) => (
                    <TableCell key={index} className="text-right tabular-nums">
                      {value}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">
                    {c.workedHours}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.overtimeHours}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function thisMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monthly Attendance (CM-309): each Team Member × day of the month with a
 * status letter, and the month's counts and hours; a month picker and the
 * Excel report. Menu `hrms.attendance` Report (Export for Excel); View All
 * shows everyone, otherwise one's own row.
 */
export function MonthlyAttendancePage({
  initialMonth,
}: {
  initialMonth?: string;
}) {
  const [month, setMonth] = useState(() => initialMonth ?? thisMonth());
  return (
    <HrmsPage
      wide
      title="Monthly Attendance"
      description="Each member's month: present, half days, absent, leave, holidays and hours."
      actions={
        <a
          href={hrmsAttendanceReportUrl(month)}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          <Download aria-hidden="true" />
          Download Excel
        </a>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="hrms-attendance-month">Month</Label>
        <Input
          id="hrms-attendance-month"
          type="month"
          className="h-10 w-44"
          value={month}
          onChange={(event) => {
            if (event.target.value.length > 0) setMonth(event.target.value);
          }}
        />
      </div>
      <AttendanceRead what="the monthly attendance">
        <Grid month={month} />
      </AttendanceRead>
    </HrmsPage>
  );
}
