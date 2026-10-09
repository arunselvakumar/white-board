"use client";

import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { cn } from "@repo/ui/lib/utils";

import { DEFAULT_BREAK_MINUTES, endsNextDay } from "@/src/labour/domain/wages";
import type { LabourSheetRow } from "@/src/queries/labour-attendance";

import {
  TIMES_FIELDS,
  timesIssues,
  timesSummary,
  workingHoursOf,
  type LabourRowDraft,
  type TimesField,
  type TimesIssues,
  type TimesPatch,
} from "./labour-sheet-form";

/**
 * A phone opens its own time picker on tap, so below desktop the picker
 * icon is hidden to leave room for "08:00 am" in a third of a phone row.
 */
const PHONE_TIME =
  "h-11 px-2 max-lg:[&::-webkit-calendar-picker-indicator]:hidden lg:px-2.5";
const TIME_INPUT = `${PHONE_TIME} lg:w-32`;

const FIELD_NAMES: Record<TimesField, string> = {
  checkIn: "check-in",
  checkOut: "check-out",
  breakMinutes: "break minutes",
};

/** "+1 day" beside a check-out that falls on the next day. */
function NextDay() {
  return (
    <span className="text-muted-foreground text-xs font-normal">+1 day</span>
  );
}

/**
 * The live preview of a row's times (ADR CM-0011): hours worked against the
 * Labour's working hours. A short day is only information; pay follows the
 * status.
 */
function WorkedPreview({
  row,
  draft,
}: {
  row: LabourSheetRow;
  draft: LabourRowDraft;
}) {
  const summary = timesSummary(row, draft);
  if (summary == null) {
    if (draft.checkIn.trim() !== "" && draft.checkOut.trim() === "")
      return <p className="text-muted-foreground text-sm">No check-out yet</p>;
    return null;
  }
  return (
    <p
      aria-label={`${row.name} worked`}
      className={cn(
        "text-sm tabular-nums",
        summary.short && "text-muted-foreground",
      )}
    >
      Worked{" "}
      <span className={cn(!summary.short && "font-medium")}>
        {summary.worked} h
      </span>{" "}
      <span className="text-muted-foreground">of {summary.workingHours} h</span>
      {summary.short ? " · short" : null}
      {summary.extra == null ? null : (
        <span className="text-muted-foreground"> · {summary.extra} h over</span>
      )}
    </p>
  );
}

/**
 * Check-in, check-out and break on a Present or Half Day row. Phone: In,
 * Out and Break side by side under the status; desktop: one line under the
 * status, shift and overtime. Messages sit under the group so a narrow
 * field never wraps them.
 */
export function RowTimes({
  row,
  draft,
  serverError,
  onChange,
}: {
  row: LabourSheetRow;
  draft: LabourRowDraft;
  /** A server error on one of these fields (`details.field`). */
  serverError: { field: TimesField; message: string } | undefined;
  onChange: (patch: TimesPatch) => void;
}) {
  const issues: TimesIssues = timesIssues(draft);
  if (serverError != null && issues[serverError.field] == null)
    issues[serverError.field] = serverError.message;
  const id = (field: TimesField) => `times-${row.labourId}-${field}`;
  const nextDay =
    draft.checkIn !== "" &&
    draft.checkOut !== "" &&
    issues.checkIn == null &&
    issues.checkOut == null &&
    endsNextDay(draft.checkIn, draft.checkOut);
  const messages = TIMES_FIELDS.flatMap((field) => {
    const message = issues[field];
    return message == null ? [] : [{ field, message }];
  });
  const described = (field: TimesField) =>
    issues[field] == null ? undefined : `${id(field)}-error`;

  return (
    <div
      role="group"
      aria-label={`${row.name} times`}
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem] gap-x-2 gap-y-1.5 lg:flex lg:flex-wrap lg:items-end lg:gap-x-3"
    >
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id("checkIn")} className="text-xs">
          In
        </Label>
        <Input
          id={id("checkIn")}
          type="time"
          aria-label={`${row.name} check-in`}
          aria-invalid={issues.checkIn != null}
          aria-describedby={described("checkIn")}
          className={TIME_INPUT}
          value={draft.checkIn}
          onChange={(event) => {
            onChange({ checkIn: event.target.value });
          }}
        />
      </div>
      <div className="min-w-0 space-y-1">
        <Label htmlFor={id("checkOut")} className="gap-1.5 text-xs">
          Out {nextDay ? <NextDay /> : null}
        </Label>
        <Input
          id={id("checkOut")}
          type="time"
          aria-label={`${row.name} check-out`}
          aria-invalid={issues.checkOut != null}
          aria-describedby={described("checkOut")}
          className={TIME_INPUT}
          value={draft.checkOut}
          onChange={(event) => {
            onChange({ checkOut: event.target.value });
          }}
        />
      </div>
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={id("breakMinutes")}
          className="text-xs whitespace-nowrap"
        >
          Break (min)
        </Label>
        <Input
          id={id("breakMinutes")}
          inputMode="numeric"
          aria-label={`${row.name} break minutes`}
          aria-invalid={issues.breakMinutes != null}
          aria-describedby={described("breakMinutes")}
          placeholder={String(DEFAULT_BREAK_MINUTES)}
          className="h-11 lg:w-20"
          value={draft.breakMinutes}
          onChange={(event) => {
            onChange({ breakMinutes: event.target.value });
          }}
        />
      </div>
      <div className="col-span-3 lg:flex lg:h-11 lg:items-center">
        <WorkedPreview row={row} draft={draft} />
      </div>
      {messages.length === 0 ? null : (
        <div className="col-span-3 space-y-0.5 lg:basis-full">
          {messages.map(({ field, message }) => (
            <p
              key={field}
              id={`${id(field)}-error`}
              role={serverError?.field === field ? "alert" : undefined}
              className="text-destructive text-sm"
            >
              <span className="sr-only">
                {row.name} {FIELD_NAMES[field]}:{" "}
              </span>
              {message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** The Labour's working hours, for the row's subtitle. */
export function workingDayLabel(row: LabourSheetRow): string {
  return `${workingHoursOf(row)} h day`;
}

/**
 * "Set times" for the selected rows: In, Out and Break applied to those
 * marked Present or Half Day. A blank time leaves each row's own, so a
 * supervisor can set everyone's check-in in the morning and their
 * check-out in the evening.
 */
export function SetTimesDialog({
  open,
  onOpenChange,
  eligible,
  skipped,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Selected rows marked Present or Half Day. */
  eligible: number;
  /** Selected rows with another status (or none). */
  skipped: number;
  onApply: (patch: TimesPatch) => void;
}) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(
    String(DEFAULT_BREAK_MINUTES),
  );
  // Checked as if every row took both times; a lone check-out is checked
  // against each row's own check-in once applied.
  const issues =
    checkIn === ""
      ? timesIssues({
          status: "present",
          checkIn: "00:00",
          checkOut: "",
          breakMinutes,
        })
      : timesIssues({ status: "present", checkIn, checkOut, breakMinutes });
  // Nothing to change until a time is in or the break differs from the
  // default it opens with.
  const nothing =
    checkIn === "" &&
    checkOut === "" &&
    ["", String(DEFAULT_BREAK_MINUTES)].includes(breakMinutes.trim());
  const labours = (count: number) =>
    `${String(count)} Labour${count === 1 ? "" : "s"}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setCheckIn("");
          setCheckOut("");
          setBreakMinutes(String(DEFAULT_BREAK_MINUTES));
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set times</DialogTitle>
          <DialogDescription>
            {eligible === 0
              ? "None of the selected Labours is marked Present or Half Day. Mark them first."
              : `For ${labours(eligible)} marked Present or Half Day. A blank time keeps what each row has.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="set-times"
          noValidate
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem] items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            // The dialog is portaled, but React still bubbles its submit to
            // the marking sheet's form, which would save the day.
            event.stopPropagation();
            if (Object.keys(issues).length > 0 || nothing || eligible === 0)
              return;
            onApply({
              ...(checkIn === "" ? {} : { checkIn }),
              ...(checkOut === "" ? {} : { checkOut }),
              ...(breakMinutes.trim() === ""
                ? {}
                : { breakMinutes: breakMinutes.trim() }),
            });
          }}
        >
          <div className="min-w-0 space-y-1">
            <Label htmlFor="set-times-in">In</Label>
            <Input
              id="set-times-in"
              type="time"
              className={PHONE_TIME}
              aria-invalid={checkIn !== "" && issues.checkIn != null}
              value={checkIn}
              onChange={(event) => {
                setCheckIn(event.target.value);
              }}
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="set-times-out" className="gap-1.5">
              Out{" "}
              {checkIn !== "" &&
              checkOut !== "" &&
              checkIn !== checkOut &&
              endsNextDay(checkIn, checkOut) ? (
                <NextDay />
              ) : null}
            </Label>
            <Input
              id="set-times-out"
              type="time"
              className={PHONE_TIME}
              aria-invalid={issues.checkOut != null}
              value={checkOut}
              onChange={(event) => {
                setCheckOut(event.target.value);
              }}
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="set-times-break" className="whitespace-nowrap">
              Break (min)
            </Label>
            <Input
              id="set-times-break"
              inputMode="numeric"
              className="h-11"
              aria-invalid={issues.breakMinutes != null}
              value={breakMinutes}
              onChange={(event) => {
                setBreakMinutes(event.target.value);
              }}
            />
          </div>
          {[issues.checkOut, issues.breakMinutes].map((message) =>
            message == null ? null : (
              <p key={message} className="text-destructive col-span-3 text-sm">
                {message}
              </p>
            ),
          )}
          {skipped > 0 ? (
            <p className="text-muted-foreground col-span-3 text-sm">
              {labours(skipped)} selected {skipped === 1 ? "is" : "are"} not
              Present or Half Day and will be skipped.
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="set-times"
            disabled={
              eligible === 0 || nothing || Object.keys(issues).length > 0
            }
          >
            Set times for {labours(eligible)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
