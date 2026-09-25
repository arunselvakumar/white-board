"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm } from "react-hook-form";
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
import type { BatchResponse, BatchWriteInput } from "@/src/queries/batches";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const batchFormSchema = z
  .object({
    courseId: z.string().min(1, "Course is required"),
    name: z
      .string()
      .trim()
      .min(1, "Batch name is required")
      .max(200, "Batch name must be 200 characters or fewer"),
    classMode: z.enum(["offline", "online", "hybrid"], {
      error: "Class Mode is required",
    }),
    capacity: z
      .string()
      .trim()
      .min(1, "Capacity is required")
      .regex(/^[1-9]\d*$/, "Capacity must be an integer of at least 1"),
    room: z.string().max(80, "Room must be 80 characters or fewer"),
    joinUrl: z.string().max(2048, "Join URL must be 2048 characters or fewer"),
    timings: z
      .array(
        z.object({
          daysOfWeek: z
            .array(z.number().int().min(0).max(6))
            .min(1, "Pick at least one day"),
          startTime: z.string().regex(TIME_RE, "Start time must be HH:mm"),
          endTime: z.string().regex(TIME_RE, "End time must be HH:mm"),
        }),
      )
      .min(1, "Batch Timings need at least one weekly slot"),
  })
  .superRefine((value, ctx) => {
    value.timings.forEach((slot, index) => {
      if (slot.startTime >= slot.endTime) {
        ctx.addIssue({
          code: "custom",
          path: ["timings", index, "endTime"],
          message: "Start time must be before end time",
        });
      }
    });
  });

export type BatchFormValues = z.infer<typeof batchFormSchema>;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function batchToFormValues(batch: BatchResponse): BatchFormValues {
  return {
    courseId: batch.courseId,
    name: batch.name,
    classMode: batch.classMode,
    capacity: String(batch.capacity),
    room: batch.room ?? "",
    joinUrl: batch.joinUrl ?? "",
    timings: batch.timings.map((slot) => ({
      daysOfWeek: [...slot.daysOfWeek],
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  };
}

export function batchFormToWriteInput(
  values: BatchFormValues,
  options: { includeCourseId: boolean },
): BatchWriteInput {
  return {
    ...(options.includeCourseId ? { courseId: values.courseId } : {}),
    name: values.name,
    classMode: values.classMode,
    capacity: Number(values.capacity),
    room: emptyToNull(values.room),
    joinUrl: emptyToNull(values.joinUrl),
    timings: values.timings.map((slot) => ({
      daysOfWeek: [...slot.daysOfWeek],
      startTime: slot.startTime,
      endTime: slot.endTime,
    })),
  };
}

const defaultSlot = {
  daysOfWeek: [] as number[],
  startTime: "09:00",
  endTime: "11:00",
};

export function BatchForm({
  courses,
  lockCourse,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  courses: { id: string; name: string }[];
  lockCourse?: boolean;
  defaultValues?: Partial<BatchFormValues>;
  submitLabel: string;
  onSubmit: (input: BatchWriteInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const courseItems = courses.map((course) => ({
    value: course.id,
    label: course.name,
  }));
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      courseId: "",
      name: "",
      classMode: "offline",
      capacity: "20",
      room: "",
      joinUrl: "",
      timings: [defaultSlot],
      ...defaultValues,
    },
  });
  const timings = useFieldArray({ control, name: "timings" });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(
            batchFormToWriteInput(values, { includeCourseId: !lockCourse }),
          );
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not save this Batch. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-4">
        {lockCourse ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="courseId">Course</Label>
            <Controller
              name="courseId"
              control={control}
              render={({ field }) => (
                <Select
                  items={courseItems}
                  value={field.value.length === 0 ? null : field.value}
                  onValueChange={(value) => {
                    if (value == null) return;
                    field.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id="courseId"
                    size="lg"
                    className="w-full min-w-0"
                  >
                    <SelectValue placeholder="Select a Course" />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {courseItems.map((course) => (
                      <SelectItem key={course.value} value={course.value}>
                        {course.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.courseId?.message} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            className="h-10"
            autoComplete="off"
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="classMode">Class Mode</Label>
          <Controller
            name="classMode"
            control={control}
            render={({ field }) => (
              <Select
                items={[...CLASS_MODE_ITEMS]}
                value={field.value}
                onValueChange={(value) => {
                  if (value == null) return;
                  field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="classMode"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue placeholder="Select Class Mode" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {CLASS_MODE_ITEMS.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.classMode?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            className="h-10"
            inputMode="numeric"
            autoComplete="off"
            {...register("capacity")}
          />
          <FieldError message={errors.capacity?.message} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="room">Room</Label>
          <Input
            id="room"
            className="h-10"
            autoComplete="off"
            {...register("room")}
          />
          <FieldError message={errors.room?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="joinUrl">Join URL</Label>
          <Input
            id="joinUrl"
            className="h-10"
            autoComplete="off"
            {...register("joinUrl")}
          />
          <FieldError message={errors.joinUrl?.message} />
        </div>
      </div>
      <div className="space-y-3">
        <Label>Timings</Label>
        {timings.fields.map((field, index) => (
          <div key={field.id} className="space-y-3 rounded-lg border p-3">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Days of week</legend>
              <Controller
                name={`timings.${index}.daysOfWeek`}
                control={control}
                render={({ field: daysField }) => (
                  <div className="flex flex-wrap gap-3">
                    {DAY_OF_WEEK_ITEMS.map((day) => {
                      const checked = daysField.value.includes(day.value);
                      const checkboxId = `slot-${index}-day-${day.value}`;
                      return (
                        <div
                          key={day.value}
                          className="flex items-center gap-2"
                        >
                          <Checkbox
                            id={checkboxId}
                            checked={checked}
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
                <FieldError
                  message={errors.timings?.[index]?.startTime?.message}
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
            {timings.fields.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  timings.remove(index);
                }}
              >
                Remove slot
              </Button>
            ) : null}
          </div>
        ))}
        <FieldError
          message={errors.timings?.root?.message ?? errors.timings?.message}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            timings.append(defaultSlot);
          }}
        >
          Add slot
        </Button>
      </div>
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
