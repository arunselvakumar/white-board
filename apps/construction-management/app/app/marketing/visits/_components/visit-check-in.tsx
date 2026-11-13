"use client";

import { LogIn, LogOut, MapPin } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";

import { FormAlert } from "@/components/auth/form-alert";
import {
  useCheckVisit,
  visitErrorMessage,
  type CheckVisitInput,
  type Visit,
} from "@/src/queries/marketing-visits";

import { shortWhen, visitTime, zoneFields } from "./visit-parts";

/** What a check-in or check-out sends: one position, or why there is none. */
export type CheckLocation =
  | { position: { latitude: number; longitude: number; accuracy: number } }
  | { location: "refused" | "unavailable" };

/** Reads the device's position once; the stories pass their own. */
export type Locate = () => Promise<CheckLocation>;

/**
 * One `getCurrentPosition` request, never a watch (ADR CM-0040 §10), and
 * a fresh reading, never a cached one. It never fails: a refusal is
 * `refused`, anything else `unavailable`.
 */
export const locateOnce: Locate = () =>
  new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve({ location: "unavailable" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          position: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Number.isFinite(position.coords.accuracy)
              ? Math.max(0, position.coords.accuracy)
              : 0,
          },
        });
      },
      (error) => {
        resolve({
          location:
            error.code === error.PERMISSION_DENIED ? "refused" : "unavailable",
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });

type Check = NonNullable<Visit["checkIn"]>;

/** A map link the person chooses to open; never an embedded map. */
export function mapUrl(position: NonNullable<Check["position"]>): string {
  return `https://www.google.com/maps/search/?api=1&query=${String(position.latitude)},${String(position.longitude)}`;
}

/**
 * "Checked in at 10:05 am by Ravi Shankar · within 12 m · Open in Maps", or
 * "· location not shared" / "· location unavailable" without a position.
 * The date shows only when it is not the Visit's day.
 */
export function CheckLine({
  check,
  word,
  visit,
}: {
  check: Check;
  word: "Checked in" | "Checked out";
  visit: Visit;
}) {
  const sameDay =
    zoneFields(new Date(check.at), visit.timeZone).date ===
    zoneFields(new Date(visit.visitAt), visit.timeZone).date;
  const when = sameDay
    ? visitTime(check.at, visit.timeZone)
    : shortWhen(check.at, visit.timeZone);
  const { position } = check;
  return (
    <>
      {`${word} at ${when} by ${check.byName}`}
      {position == null ? (
        <span className="text-muted-foreground">
          {check.location === "refused"
            ? " · location not shared"
            : " · location unavailable"}
        </span>
      ) : (
        <>
          <span className="text-muted-foreground">
            {` · within ${String(Math.round(position.accuracy))} m · `}
          </span>
          <a
            href={mapUrl(position)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary inline-flex items-center gap-0.5 underline-offset-4 hover:underline"
          >
            <MapPin aria-hidden="true" className="size-3.5" />
            Open in Maps
          </a>
        </>
      )}
    </>
  );
}

type Step = "idle" | "locating" | "saving";

/** What the screen says after the server's answer, by where the position is. */
function savedWords(
  word: "Checked in" | "Checked out",
  check: Check,
  timeZone: string,
): string {
  const at = `${word} at ${visitTime(check.at, timeZone)}`;
  if (check.location === "recorded") return `${at}, with your location.`;
  return check.location === "refused"
    ? `${at} with the time only: location was not shared. Allow location for this site in your browser to record it next time.`
    : `${at} with the time only: your phone could not find its location.`;
}

/**
 * Check in or Check out, the phone's main action on the day of a Visit:
 * one position request on the press, then the server's answer. The time
 * is kept even when the browser gives no position.
 */
export function VisitCheckPanel({
  visit,
  locate = locateOnce,
}: {
  visit: Visit;
  locate?: Locate;
}) {
  const checkIn = useCheckVisit(visit.id, "check-in");
  const checkOut = useCheckVisit(visit.id, "check-out");
  const [step, setStep] = useState<Step>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { canCheckIn, canCheckOut } = visit.actions;
  const shown = canCheckIn || canCheckOut;
  const word = canCheckIn ? "Checked in" : "Checked out";

  const press = async () => {
    const mutation = canCheckIn ? checkIn : checkOut;
    setError(null);
    setNotice(null);
    setStep("locating");
    const sent: CheckVisitInput = await locate();
    setStep("saving");
    mutation.mutate(sent, {
      onSuccess: (saved) => {
        const check = canCheckIn ? saved.checkIn : saved.checkOut;
        if (check != null) setNotice(savedWords(word, check, saved.timeZone));
      },
      onError: (caught) => {
        setError(visitErrorMessage(caught));
      },
      onSettled: () => {
        setStep("idle");
      },
    });
  };

  if (!shown && notice == null && error == null) return null;
  return (
    <div className="min-w-0 space-y-3">
      {shown && (
        <section
          aria-label={canCheckIn ? "Check in" : "Check out"}
          className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
        >
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex"
          >
            <MapPin className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {canCheckIn ? "At the site?" : "Leaving the site?"}
            </p>
            <p className="text-muted-foreground text-sm">
              {canCheckIn
                ? "Check in to record the time and where you are. Your location is read once, now."
                : "Check out to record when you left. Your location is read once, now."}
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            disabled={step !== "idle"}
            onClick={() => {
              void press();
            }}
          >
            {canCheckIn ? (
              <LogIn aria-hidden="true" />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {step === "locating"
              ? "Finding your location…"
              : step === "saving"
                ? "Saving…"
                : canCheckIn
                  ? "Check in"
                  : "Check out"}
          </Button>
        </section>
      )}
      <FormAlert message={error ?? undefined} />
      {notice != null && (
        <p
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
