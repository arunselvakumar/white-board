"use client";

import { MapPin, MapPinOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui/lib/utils";

import {
  getDeviceLocation,
  LocationError,
  type DeviceLocation,
} from "@/app/app/_components/device-location";
import { checkInPhotoUrl, type CheckInEntry } from "@/src/queries/check-ins";

import {
  ACTION_LABELS,
  fenceSentence,
  formatClockTime,
  formatLongDate,
  formatTime,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-format";
import { CheckInPhoto } from "@/app/app/_components/check-in/check-in-photo";

/**
 * The time now on the server's clock, in the Company's time zone, ticking
 * each second. `now` was the server's time when the device received it at
 * `receivedAt` (device ms); only that offset is kept, so a wrong device
 * clock does not show.
 */
export function ServerClock({
  now,
  receivedAt,
  timeZone,
}: {
  now: string;
  receivedAt: number;
  timeZone: string;
}) {
  const offset = Date.parse(now) - receivedAt;
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setDeviceNow(Date.now());
      // On the next whole second, so the seconds never skip.
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const at = deviceNow + offset;
  return (
    <div role="timer" aria-label="Time now" aria-live="off">
      <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
        {formatClockTime(at, timeZone)}
      </p>
      <p className="text-muted-foreground text-base">
        {formatLongDate(at, timeZone)}
      </p>
    </div>
  );
}

export type LocationState =
  /** Not asked yet: the browser would have to prompt. */
  | { status: "idle" }
  | { status: "finding" }
  | { status: "found"; location: DeviceLocation }
  | { status: "failed"; message: string };

function failure(error: unknown): LocationState {
  return {
    status: "failed",
    message:
      error instanceof LocationError
        ? error.message
        : "This device could not find its location.",
  };
}

/**
 * The device's location. It is asked for at once only when the browser has
 * already answered for this site (allowed, or refused), so no permission
 * prompt appears before the operator acts; otherwise `ask` runs from a tap
 * (ADR CM-0043 §5).
 */
export function useDeviceLocation(): [LocationState, () => void] {
  const [state, setState] = useState<LocationState>({ status: "idle" });
  const run = useRef(0);
  const ask = useCallback(() => {
    run.current += 1;
    const current = run.current;
    setState({ status: "finding" });
    getDeviceLocation().then(
      (location) => {
        if (current === run.current) setState({ status: "found", location });
      },
      (error: unknown) => {
        if (current === run.current) setState(failure(error));
      },
    );
  }, []);
  useEffect(() => {
    let cancelled = false;
    const permissions =
      typeof navigator !== "undefined" && "permissions" in navigator
        ? navigator.permissions
        : undefined;
    permissions
      ?.query({ name: "geolocation" })
      .then((permission) => {
        if (!cancelled && permission.state !== "prompt") ask();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      run.current += 1;
    };
  }, [ask]);
  return [state, ask];
}

/**
 * Where the location stands before submitting. Inside or outside the fence
 * is only known from the saved entry, so here it says what will happen.
 */
export function LocationLine({
  state,
  siteFence,
  onRetry,
}: {
  state: LocationState;
  siteFence: { name: string } | null;
  onRetry: () => void;
}) {
  if (state.status === "idle")
    return (
      <div className="flex items-center gap-2 text-sm">
        <MapPinOff
          aria-hidden="true"
          className="text-muted-foreground size-4 shrink-0"
        />
        <p className="text-muted-foreground min-w-0 flex-1">
          The location is not on yet.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Use location
        </Button>
      </div>
    );
  if (state.status === "finding")
    return (
      <p
        aria-live="polite"
        className="text-muted-foreground flex items-center gap-2 text-sm"
      >
        <Spinner aria-hidden="true" className="size-4" />
        Finding this device&apos;s location…
      </p>
    );
  if (state.status === "found") {
    const accuracy = state.location.accuracyMetres;
    return (
      <p aria-live="polite" className="flex items-start gap-2 text-sm">
        <MapPin
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
        />
        <span>
          {accuracy == null
            ? "Location found."
            : `Location found (± ${String(Math.round(accuracy))} m).`}
          {siteFence == null
            ? null
            : ` It will be checked against ${siteFence.name}.`}
        </span>
      </p>
    );
  }
  return (
    <div aria-live="polite" className="flex items-start gap-2 text-sm">
      <MapPinOff
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <p>No location. {state.message}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

/** The person's entries of today, oldest first, each with its photo. */
export function TodayEntries({
  entries,
  timeZone,
}: {
  entries: readonly CheckInEntry[];
  timeZone: string;
}) {
  return (
    <section aria-labelledby="check-in-today" className="space-y-2">
      <h2 id="check-in-today" className="text-base font-semibold">
        Today
      </h2>
      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No entries yet today.</p>
      ) : (
        <ol aria-label="Today's entries" className="space-y-2">
          {entries.map((entry) => {
            const fence = fenceSentence(entry);
            const label = `${ACTION_LABELS[entry.action]} ${formatTime(entry.at, timeZone)}`;
            return (
              <li key={entry.id} className="flex items-center gap-3">
                <CheckInPhoto
                  src={entry.hasPhoto ? checkInPhotoUrl(entry.id) : null}
                  className="size-11"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm font-medium",
                      entry.voided != null &&
                        "text-muted-foreground line-through",
                    )}
                  >
                    {label}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {entry.voided == null
                      ? (fence ?? "No location")
                      : `Voided · ${entry.voided.reason}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
