"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { paiseToRupeesInput, parseRupeesInput } from "@/lib/money";
import type { CourseResponse, CourseWriteInput } from "@/src/queries/courses";

const courseFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Course name is required")
      .max(200, "Course name must be 200 characters or fewer"),
    duration: z
      .string()
      .trim()
      .min(1, "Duration is required")
      .max(80, "Duration must be 80 characters or fewer"),
    description: z
      .string()
      .max(4000, "Description must be 4000 characters or fewer"),
    defaultFeeRupees: z.string().trim().min(1, "Default fee is required"),
  })
  .superRefine((value, ctx) => {
    if (parseRupeesInput(value.defaultFeeRupees) == null) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultFeeRupees"],
        message: "Enter an amount in rupees, up to 2 decimal places",
      });
    }
  });

export type CourseFormValues = z.infer<typeof courseFormSchema>;

export function courseToFormValues(course: CourseResponse): CourseFormValues {
  return {
    name: course.name,
    duration: course.duration,
    description: course.description ?? "",
    defaultFeeRupees: paiseToRupeesInput(course.defaultFeeAmountPaise),
  };
}

export function courseFormToWriteInput(
  values: CourseFormValues,
): CourseWriteInput {
  const paise = parseRupeesInput(values.defaultFeeRupees);
  if (paise == null) {
    throw new Error("Default fee is invalid.");
  }
  const description = values.description.trim();
  return {
    name: values.name,
    duration: values.duration,
    description: description.length === 0 ? null : description,
    defaultFeeAmountPaise: paise,
  };
}

export function CourseForm({
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  defaultValues?: Partial<CourseFormValues>;
  submitLabel: string;
  onSubmit: (input: CourseWriteInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      name: "",
      duration: "",
      description: "",
      defaultFeeRupees: "0",
      ...defaultValues,
    },
  });

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit(courseFormToWriteInput(values));
        } catch (error) {
          applyHttpFormError(
            error,
            setError,
            "Could not save this Course. Please try again.",
          );
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
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
      <div className="space-y-1.5">
        <Label htmlFor="duration">Duration</Label>
        <Input
          id="duration"
          className="h-10"
          placeholder="3 months"
          autoComplete="off"
          {...register("duration")}
        />
        <FieldError message={errors.duration?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="defaultFeeRupees">Default fee (₹)</Label>
        <Input
          id="defaultFeeRupees"
          className="h-10"
          inputMode="decimal"
          autoComplete="off"
          {...register("defaultFeeRupees")}
        />
        <FieldError message={errors.defaultFeeRupees?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={4} {...register("description")} />
        <FieldError message={errors.description?.message} />
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
