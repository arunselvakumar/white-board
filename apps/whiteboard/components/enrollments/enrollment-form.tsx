"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
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
import {
  DEFAULT_TIMING_SLOT,
  refineStudentTimings,
  TIMING_SOURCE_ITEMS,
  timingSlotSchema,
  TimingSlotsEditor,
} from "@/components/enrollments/student-timings-fields";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { CLASS_MODE_ITEMS } from "@/lib/class-mode";
import type { EnrollInput } from "@/src/queries/enrollments";

const enrollmentFormSchema = z
  .object({
    studentId: z.string().min(1, "Student is required"),
    batchId: z.string().min(1, "Batch is required"),
    classModeOverride: z.enum(["inherit", "offline", "online", "hybrid"]),
    timingSource: z.enum(["batch", "student"]),
    timings: z.array(timingSlotSchema),
  })
  .superRefine(refineStudentTimings);

export type EnrollmentFormValues = z.infer<typeof enrollmentFormSchema>;

const MODE_ITEMS = [
  { value: "inherit", label: "Inherit Batch Class Mode" },
  ...CLASS_MODE_ITEMS,
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
      timings: [DEFAULT_TIMING_SLOT],
      ...defaultValues,
    },
  });
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
                <SelectTrigger
                  id="studentId"
                  size="lg"
                  className="w-full min-w-0"
                >
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
                <SelectTrigger
                  id="batchId"
                  size="lg"
                  className="w-full min-w-0"
                >
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
              items={[...TIMING_SOURCE_ITEMS]}
              value={field.value}
              onValueChange={(value) => {
                if (value == null) return;
                field.onChange(value);
              }}
            >
              <SelectTrigger
                id="timingSource"
                size="lg"
                className="w-full min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                {TIMING_SOURCE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
      {timingSource === "student" ? (
        <Controller
          name="timings"
          control={control}
          render={({ field }) => (
            <TimingSlotsEditor
              value={field.value}
              onChange={field.onChange}
              errors={field.value.map((_, index) => ({
                daysOfWeek: errors.timings?.[index]?.daysOfWeek?.message,
                endTime: errors.timings?.[index]?.endTime?.message,
              }))}
            />
          )}
        />
      ) : null}
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
