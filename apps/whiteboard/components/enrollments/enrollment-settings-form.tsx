"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { CLASS_MODE_ITEMS, DAY_OF_WEEK_ITEMS } from "@/lib/class-mode";
import type { EnrollmentResponse } from "@/src/queries/enrollments";
import type { TimingSlot } from "@/src/queries/batches";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const MODE_ITEMS = [
  { value: "inherit", label: "Inherit Batch Class Mode" },
  ...CLASS_MODE_ITEMS,
];

const TIMING_ITEMS = [
  { value: "batch", label: "Inherit Batch Timings" },
  { value: "student", label: "Student-specific Timings" },
];

const schema = z
  .object({
    classModeOverride: z.enum(["inherit", "offline", "online", "hybrid"]),
    timingSource: z.enum(["batch", "student"]),
    timings: z.array(
      z.object({
        daysOfWeek: z.array(z.number().int().min(0).max(6)),
        startTime: z.string(),
        endTime: z.string(),
      }),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.timingSource !== "student") {
      return;
    }
    const slot = value.timings[0];
    if (slot == null || slot.daysOfWeek.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["timings", 0, "daysOfWeek"],
        message: "Pick at least one day",
      });
    }
    if (
      slot != null &&
      TIME_RE.test(slot.startTime) &&
      TIME_RE.test(slot.endTime) &&
      slot.startTime >= slot.endTime
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["timings", 0, "endTime"],
        message: "Start time must be before end time",
      });
    }
  });

type Values = z.infer<typeof schema>;

export function EnrollmentSettingsForm({
  enrollment,
  onSaveMode,
  onSaveTimings,
}: {
  enrollment: EnrollmentResponse;
  onSaveMode: (
    classModeOverride: "offline" | "online" | "hybrid" | null,
  ) => Promise<void>;
  onSaveTimings: (input: {
    timingSource: "batch" | "student";
    studentTimings?: TimingSlot[];
  }) => Promise<void>;
}) {
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      classModeOverride: enrollment.classModeOverride ?? "inherit",
      timingSource: enrollment.timingSource,
      timings: [
        enrollment.studentTimings?.[0] ?? {
          daysOfWeek: [],
          startTime: "17:00",
          endTime: "18:00",
        },
      ],
    },
  });
  const timings = useFieldArray({ control, name: "timings" });
  const timingSource = useWatch({ control, name: "timingSource" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSaveMode(
            values.classModeOverride === "inherit"
              ? null
              : values.classModeOverride,
          );
          await onSaveTimings({
            timingSource: values.timingSource,
            studentTimings:
              values.timingSource === "student"
                ? values.timings.map((slot) => ({
                    daysOfWeek: [...slot.daysOfWeek],
                    startTime: slot.startTime,
                    endTime: slot.endTime,
                  }))
                : undefined,
          });
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not save Enrollment settings. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="enrollmentClassMode">Class Mode</Label>
        <Controller
          name="classModeOverride"
          control={control}
          render={({ field }) => (
            <Select
              items={[...MODE_ITEMS]}
              value={field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger
                id="enrollmentClassMode"
                size="lg"
                className="w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {MODE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="enrollmentTimingSource">Timings</Label>
        <Controller
          name="timingSource"
          control={control}
          render={({ field }) => (
            <Select
              items={[...TIMING_ITEMS]}
              value={field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger
                id="enrollmentTimingSource"
                size="lg"
                className="w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {TIMING_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {timingSource === "student"
        ? timings.fields.map((field, index) => (
            <div key={field.id} className="space-y-3 rounded-lg border p-3">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Days of week</legend>
                <Controller
                  name={`timings.${index}.daysOfWeek`}
                  control={control}
                  render={({ field: daysField }) => (
                    <div className="flex flex-wrap gap-3">
                      {DAY_OF_WEEK_ITEMS.map((day) => {
                        const checkboxId = `enroll-edit-slot-${index}-day-${day.value}`;
                        return (
                          <div
                            key={day.value}
                            className="flex items-center gap-2"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={daysField.value.includes(day.value)}
                              onCheckedChange={(next) => {
                                if (next) {
                                  daysField.onChange(
                                    [...daysField.value, day.value].sort(
                                      (a, b) => a - b,
                                    ),
                                  );
                                  return;
                                }
                                daysField.onChange(
                                  daysField.value.filter(
                                    (value) => value !== day.value,
                                  ),
                                );
                              }}
                            />
                            <Label htmlFor={checkboxId}>{day.label}</Label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                />
                <FieldError
                  message={errors.timings?.[index]?.daysOfWeek?.message}
                />
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-timings.${index}.startTime`}>
                    Start
                  </Label>
                  <Input
                    id={`edit-timings.${index}.startTime`}
                    type="time"
                    className="h-10"
                    {...register(`timings.${index}.startTime`)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`edit-timings.${index}.endTime`}>End</Label>
                  <Input
                    id={`edit-timings.${index}.endTime`}
                    type="time"
                    className="h-10"
                    {...register(`timings.${index}.endTime`)}
                  />
                  <FieldError
                    message={errors.timings?.[index]?.endTime?.message}
                  />
                </div>
              </div>
            </div>
          ))
        : null}
      <Button type="submit" disabled={isSubmitting}>
        Save Class Mode and Timings
      </Button>
    </form>
  );
}
