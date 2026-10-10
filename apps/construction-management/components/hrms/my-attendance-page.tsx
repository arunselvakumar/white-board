"use client";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  CalendarPlus,
  Clock,
  LogIn,
  LogOut,
  MapPin,
  MapPinOff,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import {
  HRMS_ATTENDANCE_KEY,
  checkInHrmsAttendance,
  checkOutHrmsAttendance,
  hrmsAttendanceTodayQuery,
  type HrmsAttendanceEntry,
  type HrmsAttendanceToday,
  type HrmsDeviceLocation,
} from "@/src/queries/hrms-attendance";
import { QueryHttpError } from "@/src/queries/http";

import {
  AttendanceRead,
  EntryBadges,
  LIVE_STATE_LABELS,
  LocationError,
  formatClock,
  formatDuration,
  formatTimer,
  formatWeekdayDate,
  getDeviceLocation,
  hoursText,
  sourceLabel,
} from "./attendance-parts";
import { BackdatedAttendanceDialog } from "./backdated-attendance-dialog";
import { HrmsPage } from "./hrms-parts";
import { MissedCheckoutDialog } from "./missed-checkout-dialog";

/** The time now, ticking every second (the live timer). */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

type Problem = { title: string; message: string };

const PROBLEM_TITLES: Record<string, string> = {
  OUTSIDE_FENCE: "Outside Fence",
  OFFICE_LOCATION_NOT_CONFIGURED: "Office location is not configured",
  LOCATION_REQUIRED: "Location needed",
  ATTENDANCE_ALREADY_OPEN: "Already checked in",
  ATTENDANCE_OPEN_FROM_EARLIER_DAY: "Check-in left open",
  MONTH_LOCKED: "Month closed",
};

const LOCATION_TITLES: Record<LocationError["reason"], string> = {
  denied: "Location permission denied",
  timeout: "Location timed out",
  unavailable: "Location unavailable",
  unsupported: "Location not supported",
};

function problemOf(error: unknown): Problem {
  if (error instanceof LocationError)
    return { title: LOCATION_TITLES[error.reason], message: error.message };
  if (error instanceof QueryHttpError)
    return {
      title: PROBLEM_TITLES[error.code] ?? "Could not save",
      message: error.message,
    };
  return {
    title: "Could not save",
    message: "Something went wrong. Please try again.",
  };
}

function shiftLine(data: HrmsAttendanceToday): string {
  const { shift } = data;
  if (shift.startTime == null || shift.endTime == null)
    return `${shift.name} day · ${hoursText(shift.workingHours)}`;
  return `${shift.name} · ${shift.startTime}–${shift.endTime}`;
}

function gpsLine(data: HrmsAttendanceToday): string | null {
  if (data.gpsRequirement === "required")
    return "Check-in needs your location inside your office or site fence.";
  if (data.gpsRequirement === "record_only")
    return "Your location is recorded. A check-in outside the fence goes to approval.";
  return null;
}

function EntryRow({
  entry,
  timeZone,
  showDate = false,
}: {
  entry: HrmsAttendanceEntry;
  timeZone: string;
  showDate?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium tabular-nums">
          {showDate ? `${formatWeekdayDate(entry.date)} · ` : null}
          In {formatClock(entry.checkInAt, timeZone)}
          {entry.checkOutAt == null
            ? " · open"
            : ` · Out ${formatClock(entry.checkOutAt, timeZone)}`}
        </p>
        <EntryBadges entry={entry} />
        {entry.reason == null ? null : (
          <p className="text-muted-foreground text-xs">
            {sourceLabel(entry)}: {entry.reason}
          </p>
        )}
      </div>
      <p className="text-muted-foreground text-sm tabular-nums">
        {entry.checkOutAt == null
          ? "—"
          : formatDuration(
              new Date(entry.checkOutAt).getTime() -
                new Date(entry.checkInAt).getTime(),
            )}
      </p>
    </li>
  );
}

function CheckInCard({ data }: { data: HrmsAttendanceToday }) {
  const queryClient = useQueryClient();
  const now = useNow();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const open = data.openEntry;
  const checkedIn = open != null && data.openNow;
  const noOffice = data.gpsRequirement === "required" && data.fenceCount === 0;

  /** The device location; under Record only a failure checks in without one. */
  async function locate(mustHave: boolean): Promise<HrmsDeviceLocation> {
    if (data.gpsRequirement === "disabled") return {};
    setLocating(true);
    try {
      return await getDeviceLocation();
    } catch (error) {
      if (mustHave) throw error;
      return {};
    } finally {
      setLocating(false);
    }
  }

  const action = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      const location = await locate(
        kind === "in" && data.gpsRequirement === "required",
      );
      return kind === "in"
        ? checkInHrmsAttendance(location)
        : checkOutHrmsAttendance(location);
    },
    onMutate: () => {
      setProblem(null);
      setNotice(null);
    },
    onSuccess: async (entry, kind) => {
      if (kind === "in" && entry.approvalStatus === "pending")
        setNotice(
          "You checked in outside your fence. It goes to Attendance Approvals; the hours count once approved.",
        );
      await queryClient.invalidateQueries({ queryKey: HRMS_ATTENDANCE_KEY });
    },
    onError: (error) => {
      setProblem(problemOf(error));
    },
  });

  const busy = locating || action.isPending;
  const dayOff =
    data.holidayName != null && data.day.status === "holiday"
      ? `Holiday: ${data.holidayName}`
      : data.day.status === "week_off"
        ? "Week off today"
        : data.day.status === "on_leave"
          ? data.day.leave?.half === true
            ? "Half day of leave today"
            : "On leave today"
          : null;
  const gps = gpsLine(data);

  return (
    <section
      aria-labelledby="hrms-check-in-title"
      className="bg-card space-y-5 rounded-2xl border p-5 shadow-xs sm:p-6"
    >
      <div className="space-y-0.5">
        <p className="text-muted-foreground text-sm">
          {formatWeekdayDate(data.today)}
        </p>
        <p className="text-sm font-medium">{shiftLine(data)}</p>
      </div>

      <div className="space-y-1 text-center">
        <h3 id="hrms-check-in-title" className="text-lg font-semibold">
          {checkedIn ? "Checked in" : LIVE_STATE_LABELS[data.state]}
        </h3>
        {checkedIn ? (
          <>
            <p
              className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl"
              aria-label="Time since check-in"
              role="timer"
            >
              {formatTimer(now - new Date(open.checkInAt).getTime())}
            </p>
            <p className="text-muted-foreground text-sm">
              since {formatClock(open.checkInAt, data.timeZone)}
              {open.outOfFence ? " · outside fence, pending approval" : null}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            {data.day.workedHours > 0
              ? `${hoursText(data.day.workedHours)} worked today`
              : "Tap Check In when you reach the office or site."}
          </p>
        )}
        {dayOff == null ? null : (
          <p className="text-primary text-sm font-medium">{dayOff}</p>
        )}
      </div>

      {noOffice ? (
        <Alert variant="destructive">
          <MapPinOff aria-hidden="true" />
          <AlertTitle>Office location is not configured</AlertTitle>
          <AlertDescription>
            Your Company checks your location at check-in, but no office or site
            fence applies to you. Ask the Owner to add one in HRMS → Branches
            &amp; Sites.
          </AlertDescription>
        </Alert>
      ) : null}
      {problem == null ? null : (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{problem.title}</AlertTitle>
          <AlertDescription>{problem.message}</AlertDescription>
        </Alert>
      )}
      {notice == null ? null : (
        <Alert>
          <MapPin aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {data.canCreate ? (
        checkedIn ? (
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 w-full text-base"
            disabled={busy}
            onClick={() => {
              action.mutate("out");
            }}
          >
            <LogOut aria-hidden="true" />
            {locating ? "Finding your location…" : "Check Out"}
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-12 w-full text-base"
            disabled={busy || noOffice || open != null}
            onClick={() => {
              action.mutate("in");
            }}
          >
            <LogIn aria-hidden="true" />
            {locating ? "Finding your location…" : "Check In"}
          </Button>
        )
      ) : (
        <p className="text-muted-foreground text-center text-sm">
          Your Permission Matrix does not let you check in.
        </p>
      )}
      {gps == null ? null : (
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
          {gps}
        </p>
      )}
    </section>
  );
}

function MyAttendance() {
  const { data } = useSuspenseQuery(hrmsAttendanceTodayQuery);
  const [missed, setMissed] = useState<HrmsAttendanceEntry | null>(null);
  const [backdated, setBackdated] = useState(false);
  const open = data.openEntry;
  const stale = open != null && !data.openNow ? open : null;
  const earlierPending = data.pending.filter(
    (entry) => entry.date !== data.today,
  );

  return (
    <div className="space-y-6">
      <CheckInCard data={data} />

      {stale == null ? null : (
        <section
          aria-labelledby="hrms-open-attendance"
          className="border-chart-4/40 bg-chart-4/8 space-y-3 rounded-xl border p-4"
        >
          <div className="space-y-1">
            <h3 id="hrms-open-attendance" className="font-semibold">
              Open Attendance
            </h3>
            <p className="text-sm">
              You checked in on {formatWeekdayDate(stale.date)} at{" "}
              {formatClock(stale.checkInAt, data.timeZone)} and never checked
              out. Add the missed checkout before you check in again.
            </p>
          </div>
          {data.canCreate ? (
            <Button
              type="button"
              onClick={() => {
                setMissed(stale);
              }}
            >
              <Clock aria-hidden="true" />
              Add Missed Checkout
            </Button>
          ) : null}
        </section>
      )}

      <section aria-labelledby="hrms-today-entries" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id="hrms-today-entries" className="font-semibold">
            Today
          </h3>
          <p className="text-muted-foreground text-sm tabular-nums">
            Total {hoursText(data.day.workedHours)}
          </p>
        </div>
        {data.entries.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            No check-ins today yet.
          </p>
        ) : (
          <ul
            aria-label="Today's entries"
            className="bg-card divide-y rounded-xl border"
          >
            {data.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} timeZone={data.timeZone} />
            ))}
          </ul>
        )}
      </section>

      {earlierPending.length === 0 ? null : (
        <section aria-labelledby="hrms-my-pending" className="space-y-3">
          <h3 id="hrms-my-pending" className="font-semibold">
            Waiting for approval
          </h3>
          <ul
            aria-label="Waiting for approval"
            className="bg-card divide-y rounded-xl border"
          >
            {earlierPending.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                timeZone={data.timeZone}
                showDate
              />
            ))}
          </ul>
        </section>
      )}

      {data.canCreate ? (
        <section
          aria-labelledby="hrms-missed-day"
          className={cn(
            "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
          )}
        >
          <div className="space-y-0.5">
            <h3 id="hrms-missed-day" className="font-semibold">
              Missed a day?
            </h3>
            <p className="text-muted-foreground text-sm">
              Add a past day you worked without checking in.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBackdated(true);
            }}
          >
            <CalendarPlus aria-hidden="true" />
            Add Back-dated Attendance
          </Button>
        </section>
      ) : null}

      {missed == null ? null : (
        <MissedCheckoutDialog
          entry={missed}
          timeZone={data.timeZone}
          onClose={() => {
            setMissed(null);
          }}
        />
      )}
      {backdated ? (
        <BackdatedAttendanceDialog
          today={data.today}
          onClose={() => {
            setBackdated(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * My Attendance (CM-309): the check-in card (state, live timer, Check In /
 * Check Out with the device location), today's entries, an entry left
 * open on an earlier day with Add Missed Checkout, requests waiting for
 * approval, and Add Back-dated Attendance. Menu `hrms.attendance`.
 */
export function MyAttendancePage() {
  return (
    <HrmsPage
      title="My Attendance"
      description="Check in when you reach the office or site and check out when you leave."
    >
      <AttendanceRead what="your attendance">
        <MyAttendance />
      </AttendanceRead>
    </HrmsPage>
  );
}
