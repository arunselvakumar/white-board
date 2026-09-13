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
import type { EnrollInput } from "@/src/queries/enrollments";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const enrollmentFormSchema = z
  .object({
    studentId: z.string().min(1, "Student is required"),
    batchId: z.string().min(1, "Batch is required"),
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
  });

export type EnrollmentFormValues = z.infer<typeof enrollmentFormSchema>;

const defaultSlot = {
  daysOfWeek: [] as number[],
  startTime: "17:00",
  endTime: "18:00",
};

const MODE_ITEMS = [
  { value: "inherit", label: "Inherit Batch Class Mode" },
  ...CLASS_MODE_ITEMS,
];

const TIMING_ITEMS = [
  { value: "batch", label: "Inherit Batch Timings" },
  { value: "student", label: "Student-specific Timings" },
];

export function EnrollmentForm({
  students,
  batches,
  lockStudent,
  lockBatch,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  students: { id: string; name: string }[];
  batches: { id: string; name: string }[];
  lockStudent?: boolean;
  lockBatch?: boolean;
  defaultValues?: Partial<EnrollmentFormValues>;
  submitLabel: string;
  onSubmit: (input: EnrollInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const studentItems = students.map((student) => ({
    value: student.id,
    label: student.name,
  }));
  const batchItems = batches.map((batch) => ({
    value: batch.id,
    label: batch.name,
  }));
  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentFormValues>({
    resolver: zodResolver(enrollmentFormSchema),
    defaultValues: {
      studentId: "",
      batchId: "",
      classModeOverride: "inherit",
      timingSource: "batch",
      timings: [defaultSlot],
      ...defaultValues,
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
          await onSubmit({
            studentId: values.studentId,
            batchId: values.batchId,
            classModeOverride:
              values.classModeOverride === "inherit"
                ? null
                : values.classModeOverride,
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
            "Could not save this Enrollment. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      {lockStudent ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="studentId">Student</Label>
          <Controller
            name="studentId"
            control={control}
            render={({ field }) => (
              <Select
                items={studentItems}
                value={field.value.length === 0 ? null : field.value}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger id="studentId" size="lg" className="w-full min-w-0">
                  <SelectValue placeholder="Select a Student" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {studentItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.studentId?.message} />
        </div>
      )}
      {lockBatch ? null : (
        <div className="space-y-1.5">
          <Label htmlFor="batchId">Batch</Label>
          <Controller
            name="batchId"
            control={control}
            render={({ field }) => (
              <Select
                items={batchItems}
                value={field.value.length === 0 ? null : field.value}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger id="batchId" size="lg" className="w-full min-w-0">
                  <SelectValue placeholder="Select a Batch" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {batchItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.batchId?.message} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="classModeOverride">Class Mode</Label>
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
                id="classModeOverride"
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
        <Label htmlFor="timingSource">Timings</Label>
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
              <SelectTrigger id="timingSource" size="lg" className="w-full min-w-0">
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
                        const checkboxId = `enroll-slot-${index}-day-${day.value}`;
                        return (
                          <div key={day.value} className="flex items-center gap-2">
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
                  <Label htmlFor={`timings.${index}.startTime`}>Start</Label>
                  <Input
                    id={`timings.${index}.startTime`}
                    type="time"
                    className="h-10"
                    {...register(`timings.${index}.startTime`)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`timings.${index}.endTime`}>End</Label>
                  <Input
                    id={`timings.${index}.endTime`}
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
      <FieldError message={errors.timings?.message} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel != null ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
