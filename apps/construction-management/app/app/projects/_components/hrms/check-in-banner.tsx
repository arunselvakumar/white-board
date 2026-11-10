"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, LogIn } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";

import { HRMS_PATH } from "@/lib/hrms-nav";
import { hrmsAttendanceTodayQuery } from "@/src/queries/hrms-attendance";

export const MY_ATTENDANCE_PATH = `${HRMS_PATH}/attendance/my`;

/**
 * The Projects home "Not checked in · Check In" banner (CM-309,
 * `modules/10` "Workspace placement"): shown to a Team Member who may
 * check in (`hrms.attendance` create) and has not checked in today on a
 * working day. It links to My Attendance, where the location is taken.
 * Hidden while loading, without access, once checked in or out today, and
 * on a holiday, week off or full day of leave.
 */
export function CheckInBanner() {
  const { data } = useQuery({ ...hrmsAttendanceTodayQuery, retry: false });
  if (data == null || !data.canCreate || data.state !== "not_checked_in")
    return null;
  return (
    <section
      aria-label="Attendance"
      className="bg-card flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-xs"
    >
      <span
        aria-hidden="true"
        className="bg-chart-4/12 text-chart-4 flex size-10 shrink-0 items-center justify-center rounded-xl"
      >
        <Clock className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Not checked in</p>
        <p className="text-muted-foreground text-sm">
          {data.openEntry != null && !data.openNow
            ? "An earlier check-in is still open. Close it, then check in."
            : "Check in when you reach the office or site."}
        </p>
      </div>
      <Link href={MY_ATTENDANCE_PATH} className={buttonVariants()}>
        <LogIn aria-hidden="true" />
        Check In
      </Link>
    </section>
  );
}
