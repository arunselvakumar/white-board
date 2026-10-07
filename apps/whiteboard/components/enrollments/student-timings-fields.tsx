"use client";

import { z } from "zod";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { DAY_OF_WEEK_ITEMS } from "@/lib/class-mode";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Where an Enrollment's Timings come from: the Batch, or the Student (home tuition). */
export const TIMING_SOURCE_ITEMS = [
  { value: "batch", label: "Inherit Batch Timings" },
  { value: "student", label: "Student-specific Timings" },
] as const;

export const timingSlotSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  startTime: z.string(),
  endTime: z.string(),
});

export type TimingSlotValues = z.infer<typeof timingSlotSchema>;

export const DEFAULT_TIMING_SLOT: TimingSlotValues = {
  daysOfWeek: [],
  startTime: "17:00",
  endTime: "18:00",
};

/** Zod refinement shared by every form that sets Student-specific Timings. */
export function refineStudentTimings(
  value: { timingSource: "batch" | "student"; timings: TimingSlotValues[] },
  ctx: z.RefinementCtx,
): void {
  if (value.timingSource !== "student") {
    return;
  }
  if (value.timings.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["timings"],
      message: "Student-specific Timings need at least one weekly slot",
    });
    return;
  }
  value.timings.forEach((slot, index) => {
    if (slot.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["timings", index, "daysOfWeek"],
        message: "Pick at least one day",
      });
    }
    if (!TIME_RE.test(slot.startTime) || !TIME_RE.test(slot.endTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["timings", index, "endTime"],
        message: "Times must be HH:mm",
      });
    } else if (slot.startTime >= slot.endTime) {
      ctx.addIssue({
        code: "custom",
        path: ["timings", index, "endTime"],
        message: "Start time must be before end time",
      });
    }
  });
}

export type TimingSlotErrors = { daysOfWeek?: string; endTime?: string };

/** Weekly Student-specific Timings: days of week, start, and end for each slot. */
export function TimingSlotsEditor({
  value,
  onChange,
  errors,
  idPrefix = "enroll-slot",
}: {
  value: TimingSlotValues[];
  onChange: (next: TimingSlotValues[]) => void;
  errors?: (TimingSlotErrors | undefined)[];
  idPrefix?: string;
}) {
  const updateSlot = (index: number, patch: Partial<TimingSlotValues>) => {
    onChange(
      value.map((slot, slotIndex) =>
        slotIndex === index ? { ...slot, ...patch } : slot,
      ),
    );
  };

  return (
    <>
      {value.map((slot, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-3">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Days of week</legend>
            <div className="flex flex-wrap gap-3">
              {DAY_OF_WEEK_ITEMS.map((day) => {
                const checkboxId = `${idPrefix}-${index}-day-${day.value}`;
                return (
                  <div key={day.value} className="flex items-center gap-2">
                    <Checkbox
                      id={checkboxId}
                      checked={slot.daysOfWeek.includes(day.value)}
                      onCheckedChange={(next) => {
                        updateSlot(index, {
                          daysOfWeek: next
                            ? [...slot.daysOfWeek, day.value].sort(
                                (a, b) => a - b,
                              )
                            : slot.daysOfWeek.filter(
                                (selected) => selected !== day.value,
                              ),
                        });
                      }}
                    />
                    <Label htmlFor={checkboxId}>{day.label}</Label>
                  </div>
                );
              })}
            </div>
            <FieldError message={errors?.[index]?.daysOfWeek} />
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-${index}-start`}>Start</Label>
              <Input
                id={`${idPrefix}-${index}-start`}
                type="time"
                className="h-10"
                value={slot.startTime}
                onChange={(event) => {
                  updateSlot(index, { startTime: event.target.value });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-${index}-end`}>End</Label>
              <Input
                id={`${idPrefix}-${index}-end`}
                type="time"
                className="h-10"
                value={slot.endTime}
                onChange={(event) => {
                  updateSlot(index, { endTime: event.target.value });
                }}
              />
              <FieldError message={errors?.[index]?.endTime} />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
