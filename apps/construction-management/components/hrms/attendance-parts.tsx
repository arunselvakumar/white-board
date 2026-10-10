"use client";

import { Suspense, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

import type { HrmsDayStatus } from "@/src/hrms/application/ports";
import type { LiveState } from "@/src/hrms/domain/attendance";
import type { HrmsAttendanceEntry } from "@/src/queries/hrms-attendance";

import { HrmsAccessBoundary } from "./hrms-parts";

/**
 * Shared pieces of the attendance screens (CM-309): labels and tones for
 * day statuses and live states, Company-time clocks, the device location
 * and a boundary that turns a 403 into a plain "no access" state.
 */

export const DAY_STATUS_LABELS: Record<HrmsDayStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  on_leave: "On Leave",
  holiday: "Holiday",
  week_off: "Week Off",
};

/** The grid's letters (the Excel report uses the same). */
export const DAY_STATUS_LETTERS: Record<HrmsDayStatus, string> = {
  present: "P",
  half_day: "HD",
  absent: "A",
  on_leave: "L",
  holiday: "H",
  week_off: "WO",
};

/** Text colours the labour month grid already uses for its codes. */
export const DAY_STATUS_TEXT: Record<HrmsDayStatus, string> = {
  present: "text-emerald-700 dark:text-emerald-400",
  half_day: "text-amber-700 dark:text-amber-400",
  absent: "text-destructive",
  on_leave: "text-sky-700 dark:text-sky-400",
  holiday: "text-violet-700 dark:text-violet-400",
  week_off: "text-muted-foreground",
};

export const LIVE_STATE_LABELS: Record<LiveState, string> = {
  checked_in: "Checked in",
  checked_out: "Checked out",
  not_checked_in: "Not checked in",
  on_leave: "On Leave",
  holiday: "Holiday",
  week_off: "Week Off",
};

/** Tones the Projects home stat cards use. */
const LIVE_TONE: Record<LiveState, string> = {
  checked_in: "bg-chart-3/12 text-chart-3",
  checked_out: "bg-chart-2/12 text-chart-2",
  not_checked_in: "bg-destructive/10 text-destructive",
  on_leave: "bg-chart-4/12 text-chart-4",
  holiday: "bg-primary/12 text-primary",
  week_off: "bg-secondary text-muted-foreground",
};

export function LiveStateBadge({ state }: { state: LiveState }) {
  return (
    <Badge variant="outline" className={cn("border-0", LIVE_TONE[state])}>
      {LIVE_STATE_LABELS[state]}
    </Badge>
  );
}

const SOURCE_LABELS: Record<HrmsAttendanceEntry["source"], string> = {
  check_in: "Check-in",
  manual: "Back-dated",
  missed_checkout: "Missed checkout",
};

/** Where an entry came from, and why it waits (or waited) for approval. */
export function EntryBadges({
  entry,
  showSource = true,
}: {
  entry: HrmsAttendanceEntry;
  showSource?: boolean;
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {showSource && entry.source !== "check_in" ? (
        <Badge variant="secondary">{SOURCE_LABELS[entry.source]}</Badge>
      ) : null}
      {entry.outOfFence ? (
        <Badge
          variant="outline"
          className="bg-chart-4/12 text-chart-4 border-0"
        >
          Outside fence
        </Badge>
      ) : null}
      {entry.approvalStatus === "pending" ? (
        <Badge variant="outline">Pending approval</Badge>
      ) : null}
      {entry.approvalStatus === "rejected" ? (
        <Badge variant="destructive">Rejected</Badge>
      ) : null}
    </span>
  );
}

export function sourceLabel(entry: HrmsAttendanceEntry): string {
  return SOURCE_LABELS[entry.source];
}

const CLOCKS = new Map<string, Intl.DateTimeFormat>();

/** `9:05 am` in the Company's time zone. */
export function formatClock(iso: string, timeZone: string): string {
  let format = CLOCKS.get(timeZone);
  if (format == null) {
    format = new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });
    CLOCKS.set(timeZone, format);
  }
  return format.format(new Date(iso)).toLowerCase();
}

/** `2h 05m`. */
export function formatDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
  return `${String(Math.floor(minutes / 60))}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** `02:14:33`, for the live timer. */
export function formatTimer(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const parts = [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ];
  return parts.map((part) => String(part).padStart(2, "0")).join(":");
}

/** `8.5 h`. */
export function hoursText(hours: number): string {
  return `${String(Number(hours.toFixed(2)))} h`;
}

const WEEKDAY_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** `Saturday, 10 Oct` for a calendar date. */
export function formatWeekdayDate(date: string): string {
  return WEEKDAY_DATE.format(new Date(`${date}T00:00:00.000Z`));
}

export type DeviceLocation = {
  latitude: number;
  longitude: number;
  accuracyMetres: number | null;
};

/** Why the device location could not be read, in words for the screen. */
export class LocationError extends Error {
  constructor(
    readonly reason: "unsupported" | "denied" | "timeout" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "LocationError";
  }
}

/**
 * The device's current location through `navigator.geolocation`, with a
 * clear message when permission is denied, it times out or the device
 * cannot tell.
 */
export function getDeviceLocation(timeoutMs = 15_000): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(
        new LocationError(
          "unsupported",
          "This browser cannot share your location. Open the app in Chrome or Safari on your phone.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED)
          reject(
            new LocationError(
              "denied",
              "Location permission is off. Allow location for this site in your browser settings, then try again.",
            ),
          );
        else if (error.code === error.TIMEOUT)
          reject(
            new LocationError(
              "timeout",
              "Your location took too long to find. Step outside or near a window and try again.",
            ),
          );
        else
          reject(
            new LocationError(
              "unavailable",
              "Your phone could not find its location. Turn on location (GPS) and try again.",
            ),
          );
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/** A Suspense with a skeleton and the "no access" boundary around a page read. */
export function AttendanceRead({
  what,
  children,
}: {
  what: string;
  children: ReactNode;
}) {
  return (
    <HrmsAccessBoundary what={what}>
      <Suspense
        fallback={
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-40 w-full" />
          </div>
        }
      >
        {children}
      </Suspense>
    </HrmsAccessBoundary>
  );
}
