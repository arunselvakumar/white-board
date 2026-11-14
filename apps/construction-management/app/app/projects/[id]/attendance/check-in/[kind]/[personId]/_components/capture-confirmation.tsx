"use client";

import { CircleCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@repo/ui/components/button";

import type { RecordCheckInResult } from "@/src/queries/check-ins";

import {
  fenceSentence,
  formatTime,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-format";

/** How long the confirmation stays before going back to the search. */
export const CONFIRMATION_MS = 4000;

/** "Checked in at 10:02 am", or "Already recorded at 10:02 am" for a repeat. */
export function confirmationTitle(
  result: RecordCheckInResult,
  timeZone: string,
): string {
  const time = formatTime(result.entry.at, timeZone);
  if (result.repeated) return `Already recorded at ${time}`;
  return `${result.entry.action === "check_in" ? "Checked in" : "Checked out"} at ${time}`;
}

/**
 * Covers the capture screen after an entry is recorded: the photo taken,
 * the time from the saved entry, the name, any note about the Labour's day
 * and the fence result. Gone after four seconds, or on a tap.
 */
export function CaptureConfirmation({
  result,
  photoUrl,
  timeZone,
  onDone,
}: {
  result: RecordCheckInResult;
  photoUrl: string;
  timeZone: string;
  onDone: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    done.current?.focus();
    const timer = setTimeout(onDone, CONFIRMATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [onDone]);
  const fence = fenceSentence(result.entry);
  return (
    <div className="bg-background fixed inset-0 z-10">
      <Button
        ref={done}
        type="button"
        variant="ghost"
        aria-label="Done, back to the search"
        className="absolute inset-0 size-full rounded-none hover:bg-transparent focus-visible:ring-0"
        onClick={onDone}
      />
      <div
        role="status"
        className="motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 pointer-events-none relative mx-auto flex h-full w-full max-w-lg flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center duration-200"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the frame just taken, a local URL */}
        <img
          src={photoUrl}
          alt={result.person.name}
          className="bg-sidebar aspect-[4/3] w-full max-w-sm rounded-2xl object-cover"
        />
        <CircleCheck
          aria-hidden="true"
          className="size-12 text-emerald-700 dark:text-emerald-400"
        />
        <p className="text-3xl font-semibold tracking-tight">
          {confirmationTitle(result, timeZone)}
        </p>
        <p className="text-xl">{result.person.name}</p>
        {fence == null ? null : (
          <p className="text-muted-foreground text-base">{fence}</p>
        )}
        {result.day?.note == null ? null : (
          <p className="bg-muted rounded-lg px-4 py-3 text-base">
            {result.day.note}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Tap anywhere to go back to the search.
        </p>
      </div>
    </div>
  );
}
