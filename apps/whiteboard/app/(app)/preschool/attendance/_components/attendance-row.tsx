"use client";

import { Clock, LogOut, Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { cn } from "@repo/ui/lib/utils";

import { ChildAvatar } from "@/app/(app)/preschool/_components/child-avatar";
import { isClockTime } from "@/src/preschool/domain/attendance";
import {
  PRESCHOOL_ATTENDANCE_STATUS_LABELS,
  type PreschoolAttendanceRosterChild,
  type PreschoolAttendanceStatus,
} from "@/src/queries/preschool/attendance";

const STATUSES = ["present", "absent", "leave"] as const;

const SELECTED: Record<PreschoolAttendanceStatus, string> = {
  present:
    "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600 hover:text-white dark:border-emerald-500 dark:bg-emerald-500",
  absent:
    "border-red-600 bg-red-600 text-white hover:bg-red-600 hover:text-white dark:border-red-500 dark:bg-red-500",
  leave:
    "border-amber-500 bg-amber-500 text-white hover:bg-amber-500 hover:text-white",
};

/** "Lakshmi (Grandmother)", "Arjun (Father)", "Ravi (not on the list)". */
export function collectorLabel(child: PreschoolAttendanceRosterChild): string {
  const collected = child.mark?.collectedBy;
  if (collected == null) return "";
  const relation =
    collected.kind === "father"
      ? "Father"
      : collected.kind === "mother"
        ? "Mother"
        : collected.kind === "authorised_pickup"
          ? (child.authorisedPickups.find(
              (pickup) => pickup.id === collected.pickupId,
            )?.relationship ?? "Authorised Pickup")
          : "not on the list";
  return `${collected.name} (${relation})`;
}

function CheckInTime({
  child,
  editable,
  onSave,
}: {
  child: PreschoolAttendanceRosterChild;
  editable: boolean;
  onSave: (time: string) => Promise<void>;
}) {
  const time = child.mark?.checkInTime ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(time ?? "");
  const [saving, setSaving] = useState(false);

  if (editing)
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isClockTime(value)) return;
          setSaving(true);
          void onSave(value)
            .then(() => {
              setEditing(false);
            })
            .finally(() => {
              setSaving(false);
            });
        }}
      >
        <Input
          type="time"
          aria-label={`Check-in time for ${child.name}`}
          className="h-11 w-32"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
        <Button type="submit" className="h-11" disabled={saving}>
          Save
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          onClick={() => {
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </form>
    );
  if (!editable)
    return (
      <p className="text-muted-foreground text-sm">
        {time == null ? "No check-in time" : `In ${time}`}
      </p>
    );
  return (
    <Button
      type="button"
      variant="ghost"
      className="text-muted-foreground h-11 px-2"
      aria-label={
        time == null
          ? `Add check-in time for ${child.name}`
          : `Check-in ${time} for ${child.name}. Change`
      }
      onClick={() => {
        setValue(time ?? "");
        setEditing(true);
      }}
    >
      <Clock aria-hidden="true" />
      {time == null ? "Add check-in time" : `In ${time}`}
    </Button>
  );
}

/**
 * One Child on the register: Present / Absent / Leave, the check-in time,
 * and Check out or who collected them.
 */
export function AttendanceRow({
  child,
  editable,
  onStatus,
  onCheckIn,
  onCheckOut,
  onUndoCheckOut,
}: {
  child: PreschoolAttendanceRosterChild;
  editable: boolean;
  onStatus: (status: PreschoolAttendanceStatus) => void;
  onCheckIn: (time: string) => Promise<void>;
  onCheckOut: () => void;
  onUndoCheckOut: () => void;
}) {
  const mark = child.mark;
  const present = mark?.status === "present";
  const collected = mark?.checkOutTime != null;

  return (
    <li className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <ChildAvatar
          childId={child.childId}
          name={child.name}
          photoUrl={child.photoUrl}
          className="size-10 shrink-0"
        />
        <p className="flex min-w-0 items-center gap-2 font-medium">
          <span className="truncate">{child.name}</span>
          {child.hasAllergies ? (
            <span
              className="size-2.5 shrink-0 rounded-full bg-red-500"
              role="img"
              aria-label="Has allergies"
              title="Has allergies"
            />
          ) : null}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={`Attendance for ${child.name}`}
        className="grid grid-cols-3 gap-1.5 sm:w-72"
      >
        {STATUSES.map((status) => {
          const selected = mark?.status === status;
          return (
            <Button
              key={status}
              type="button"
              variant="outline"
              role="radio"
              aria-checked={selected}
              disabled={!editable}
              className={cn("h-11 rounded-lg", selected && SELECTED[status])}
              onClick={() => {
                if (!selected) onStatus(status);
              }}
            >
              {PRESCHOOL_ATTENDANCE_STATUS_LABELS[status]}
            </Button>
          );
        })}
      </div>
      {present ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-2 border-t pt-2">
          <CheckInTime
            key={mark.checkInTime ?? "none"}
            child={child}
            editable={editable}
            onSave={onCheckIn}
          />
          {collected ? (
            <div className="flex min-w-0 items-center gap-1">
              <p className="min-w-0 text-sm">
                Collected {mark.checkOutTime} by {collectorLabel(child)}
              </p>
              {editable ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11"
                  aria-label={`Undo check-out of ${child.name}`}
                  onClick={onUndoCheckOut}
                >
                  <Undo2 aria-hidden="true" />
                  Undo
                </Button>
              ) : null}
            </div>
          ) : editable && mark.checkInTime != null ? (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              aria-label={`Check out ${child.name}`}
              onClick={onCheckOut}
            >
              <LogOut aria-hidden="true" />
              Check out
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
