"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
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
import { Switch } from "@repo/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { ISO_WEEKDAYS, ISO_WEEKDAY_LABELS } from "@/src/hrms/domain/calendar";
import {
  SHIFT_LIMITS,
  crossesMidnight,
  formatMinutes,
  isShiftTime,
  shiftLengthMinutes,
} from "@/src/hrms/domain/shift";
import {
  HRMS_SHIFTS_KEY,
  createHrmsShiftTemplate,
  updateHrmsShiftTemplate,
  type HrmsShiftTemplate,
} from "@/src/queries/hrms-shifts";

const HOURS_RE = /^\d{1,2}(\.\d{1,2})?$/;

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the shift name")
      .max(SHIFT_LIMITS.maxNameLength, "Use at most 60 characters"),
    startTime: z.string().refine(isShiftTime, "Choose the start time"),
    endTime: z.string().refine(isShiftTime, "Choose the end time"),
    workingDays: z.array(z.number()).min(1, "Choose at least one working day"),
    workingHours: z
      .string()
      .trim()
      .regex(HOURS_RE, "Enter hours, like 8 or 8.5")
      .refine(
        (value) => Number(value) > 0 && Number(value) <= 24,
        "Use more than 0 and at most 24 hours",
      ),
    halfDayHours: z
      .string()
      .trim()
      .regex(HOURS_RE, "Enter hours, like 4 or 4.5")
      .refine((value) => Number(value) > 0, "Use more than 0 hours"),
    graceMinutes: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Enter whole minutes")
      .refine(
        (value) => Number(value) <= SHIFT_LIMITS.maxGraceMinutes,
        "Use at most 120 minutes",
      ),
    overtimeAllowed: z.boolean(),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    if (
      HOURS_RE.test(values.halfDayHours) &&
      HOURS_RE.test(values.workingHours) &&
      Number(values.halfDayHours) >= Number(values.workingHours)
    )
      context.addIssue({
        code: "custom",
        path: ["halfDayHours"],
        message: "Use fewer hours than the working hours",
      });
    if (
      isShiftTime(values.startTime) &&
      isShiftTime(values.endTime) &&
      HOURS_RE.test(values.workingHours) &&
      Math.round(Number(values.workingHours) * 60) >
        shiftLengthMinutes(values.startTime, values.endTime)
    )
      context.addIssue({
        code: "custom",
        path: ["workingHours"],
        message: `The shift is only ${formatMinutes(shiftLengthMinutes(values.startTime, values.endTime))} long`,
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  SHIFT_NAME_REQUIRED: "name",
  SHIFT_NAME_TOO_LONG: "name",
  SHIFT_NAME_TAKEN: "name",
  SHIFT_START_INVALID: "startTime",
  SHIFT_END_INVALID: "endTime",
  SHIFT_WORKING_DAYS_INVALID: "workingDays",
  SHIFT_WORKING_HOURS_INVALID: "workingHours",
  SHIFT_WORKING_HOURS_TOO_LONG: "workingHours",
  SHIFT_HALF_DAY_HOURS_INVALID: "halfDayHours",
  SHIFT_GRACE_MINUTES_INVALID: "graceMinutes",
};

function toValues(shift: HrmsShiftTemplate | null): Values {
  return {
    name: shift?.name ?? "",
    startTime: shift?.startTime ?? "09:00",
    endTime: shift?.endTime ?? "18:00",
    workingDays: shift?.workingDays ?? [1, 2, 3, 4, 5, 6],
    workingHours: String(shift?.workingHours ?? 8),
    halfDayHours: String(shift?.halfDayHours ?? 4),
    graceMinutes: String(shift?.graceMinutes ?? 15),
    overtimeAllowed: shift?.overtimeAllowed ?? false,
    isActive: shift?.isActive ?? true,
  };
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint == null ? null : (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      <FieldError message={error} />
    </div>
  );
}

/**
 * Add or edit a shift template (CM-306): times (an end at or before the
 * start crosses midnight), working days, working and half-day hours,
 * grace, overtime and whether it is offered.
 */
export function ShiftDialog({
  shift,
  onClose,
}: {
  /** Null to add. */
  shift: HrmsShiftTemplate | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(shift),
  });
  const errors = form.formState.errors;
  const [startTime, endTime] = useWatch({
    control: form.control,
    name: ["startTime", "endTime"],
  });
  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = {
        ...values,
        workingHours: Number(values.workingHours),
        halfDayHours: Number(values.halfDayHours),
        graceMinutes: Number(values.graceMinutes),
      };
      return shift == null
        ? createHrmsShiftTemplate(body)
        : updateHrmsShiftTemplate(shift.id, {
            ...body,
            expectedUpdatedAt: shift.updatedAt,
          });
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_SHIFTS_KEY });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  const night =
    isShiftTime(startTime) &&
    isShiftTime(endTime) &&
    crossesMidnight(startTime, endTime);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {shift == null ? "Add Shift" : `Edit ${shift.name}`}
            </DialogTitle>
            <DialogDescription>
              Members on this shift are late after the start plus the grace
              period, and their day counts against these hours.
            </DialogDescription>
          </DialogHeader>
          <Field
            id="shift-name"
            label="Shift name"
            error={errors.name?.message}
          >
            <Input
              id="shift-name"
              className="h-10"
              autoComplete="off"
              placeholder="General"
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="shift-start"
              label="Start time"
              error={errors.startTime?.message}
            >
              <Input
                id="shift-start"
                type="time"
                className="h-10"
                aria-invalid={errors.startTime != null}
                {...form.register("startTime")}
              />
            </Field>
            <Field
              id="shift-end"
              label="End time"
              hint={
                night
                  ? "Ends the next day; the shift counts on the day it starts."
                  : undefined
              }
              error={errors.endTime?.message}
            >
              <Input
                id="shift-end"
                type="time"
                className="h-10"
                aria-describedby={night ? "shift-end-hint" : undefined}
                aria-invalid={errors.endTime != null}
                {...form.register("endTime")}
              />
            </Field>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Working days</legend>
            <Controller
              name="workingDays"
              control={form.control}
              render={({ field }) => (
                <ToggleGroup
                  multiple
                  value={field.value.map(String)}
                  onValueChange={(value: string[]) => {
                    field.onChange(value.map(Number).sort((a, b) => a - b));
                  }}
                  variant="outline"
                  size="sm"
                  className="flex-wrap"
                >
                  {ISO_WEEKDAYS.map((day) => (
                    <ToggleGroupItem
                      key={day}
                      value={String(day)}
                      aria-label={ISO_WEEKDAY_LABELS[day]}
                    >
                      {ISO_WEEKDAY_LABELS[day].slice(0, 3)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            <p className="text-muted-foreground text-xs">
              Other days are week offs for members on this shift.
            </p>
            <FieldError message={errors.workingDays?.message} />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="shift-hours"
              label="Working hours"
              error={errors.workingHours?.message}
            >
              <Input
                id="shift-hours"
                inputMode="decimal"
                className="h-10"
                aria-invalid={errors.workingHours != null}
                {...form.register("workingHours")}
              />
            </Field>
            <Field
              id="shift-half-day"
              label="Half-day hours"
              error={errors.halfDayHours?.message}
            >
              <Input
                id="shift-half-day"
                inputMode="decimal"
                className="h-10"
                aria-invalid={errors.halfDayHours != null}
                {...form.register("halfDayHours")}
              />
            </Field>
            <Field
              id="shift-grace"
              label="Grace period (minutes)"
              error={errors.graceMinutes?.message}
            >
              <Input
                id="shift-grace"
                inputMode="numeric"
                className="h-10"
                aria-invalid={errors.graceMinutes != null}
                {...form.register("graceMinutes")}
              />
            </Field>
          </div>
          <div className="space-y-4">
            <Controller
              name="overtimeAllowed"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="shift-overtime">Overtime allowed</Label>
                    <p
                      id="shift-overtime-hint"
                      className="text-muted-foreground text-xs"
                    >
                      Hours beyond the shift are paid at twice the hourly rate.
                    </p>
                  </div>
                  <Switch
                    id="shift-overtime"
                    aria-describedby="shift-overtime-hint"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
            <Controller
              name="isActive"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="shift-active">Active</Label>
                    <p
                      id="shift-active-hint"
                      className="text-muted-foreground text-xs"
                    >
                      Inactive shifts are not offered for new rotations or
                      assignments. Members already on them keep them.
                    </p>
                  </div>
                  <Switch
                    id="shift-active"
                    aria-describedby="shift-active-hint"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save shift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
