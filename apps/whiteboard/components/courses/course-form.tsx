"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import { paiseToRupeesInput, parseRupeesInput } from "@/lib/money";
import type { CourseResponse, CourseWriteInput } from "@/src/queries/courses";

const durationKinds = [
  { value: "fixed", label: "Fixed" },
  { value: "flexible", label: "Flexible" },
];
const durationUnits = [
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];
const positiveInteger = (value: string) =>
  /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const courseFormSchema = z
  .object({
    name: z.string().trim().min(1, "Course name is required").max(200),
    durationKind: z.enum(["fixed", "flexible"]),
    durationValue: z.string().trim(),
    durationUnit: z.enum(["days", "weeks", "months"]),
    code: z.string().trim().max(40),
    category: z.string().trim().max(100),
    totalLearningHours: z.string().trim(),
    eligibility: z.string().trim().max(1000),
    learningOutcomes: z.string(),
    syllabusOutline: z.string(),
    description: z.string().max(4000),
    defaultFeeRupees: z.string().trim().min(1, "Default fee is required"),
  })
  .superRefine((value, ctx) => {
    if (
      value.durationKind === "fixed" &&
      (!positiveInteger(value.durationValue) ||
        Number(value.durationValue) > 1000)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["durationValue"],
        message: "Expected duration is required",
      });
    }
    if (
      value.totalLearningHours &&
      (!positiveInteger(value.totalLearningHours) ||
        Number(value.totalLearningHours) > 100000)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["totalLearningHours"],
        message: "Enter a positive whole number of hours",
      });
    }
    if (value.code && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/.test(value.code)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "Use letters, numbers, hyphens, or underscores",
      });
    }
    if (
      lines(value.learningOutcomes).length > 20 ||
      lines(value.learningOutcomes).some((line) => line.length > 500)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["learningOutcomes"],
        message: "Use at most 20 outcomes, 500 characters each",
      });
    }
    if (
      lines(value.syllabusOutline).length > 50 ||
      lines(value.syllabusOutline).some((line) => line.length > 200)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["syllabusOutline"],
        message: "Use at most 50 topics, 200 characters each",
      });
    }
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
    durationKind: course.duration.kind,
    durationValue:
      course.duration.kind === "fixed" ? String(course.duration.value) : "",
    durationUnit:
      course.duration.kind === "fixed" ? course.duration.unit : "months",
    code: course.code ?? "",
    category: course.category ?? "",
    totalLearningHours:
      course.totalLearningHours == null
        ? ""
        : String(course.totalLearningHours),
    eligibility: course.eligibility ?? "",
    learningOutcomes: course.learningOutcomes.join("\n"),
    syllabusOutline: course.syllabusOutline.join("\n"),
    description: course.description ?? "",
    defaultFeeRupees: paiseToRupeesInput(course.defaultFeeAmountPaise),
  };
}

export function courseFormToWriteInput(
  values: CourseFormValues,
): CourseWriteInput {
  const paise = parseRupeesInput(values.defaultFeeRupees);
  if (paise == null) throw new Error("Default fee is invalid.");
  return {
    name: values.name.trim(),
    duration:
      values.durationKind === "flexible"
        ? { kind: "flexible" }
        : {
            kind: "fixed",
            value: Number(values.durationValue),
            unit: values.durationUnit,
          },
    code: values.code.trim().toUpperCase() || null,
    category: values.category.trim() || null,
    totalLearningHours: values.totalLearningHours
      ? Number(values.totalLearningHours)
      : null,
    eligibility: values.eligibility.trim() || null,
    learningOutcomes: lines(values.learningOutcomes),
    syllabusOutline: lines(values.syllabusOutline),
    description: values.description.trim() || null,
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
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(courseFormSchema),
    defaultValues: {
      name: "",
      durationKind: "fixed",
      durationValue: "",
      durationUnit: "months",
      code: "",
      category: "",
      totalLearningHours: "",
      eligibility: "",
      learningOutcomes: "",
      syllabusOutline: "",
      description: "",
      defaultFeeRupees: "0",
      ...defaultValues,
    },
  });
  const durationKind = useWatch({ control, name: "durationKind" });
  return (
    <form
      noValidate
      className="space-y-6"
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
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Course details</h2>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="code">Course code</Label>
            <Input
              id="code"
              className="h-10"
              placeholder="DCA"
              autoComplete="off"
              {...register("code")}
            />
            <FieldError message={errors.code?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              className="h-10"
              placeholder="Computing"
              autoComplete="off"
              {...register("category")}
            />
            <FieldError message={errors.category?.message} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="durationKind">Duration type</Label>
          <Controller
            name="durationKind"
            control={control}
            render={({ field }) => (
              <Select
                items={durationKinds}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger id="durationKind" size="lg" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  {durationKinds.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        {durationKind === "fixed" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="durationValue">Expected duration</Label>
              <Input
                id="durationValue"
                className="h-10"
                inputMode="numeric"
                placeholder="3"
                {...register("durationValue")}
              />
              <FieldError message={errors.durationValue?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="durationUnit">Duration unit</Label>
              <Controller
                name="durationUnit"
                control={control}
                render={({ field }) => (
                  <Select
                    items={durationUnits}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="durationUnit"
                      size="lg"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      {durationUnits.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Students can complete this Course at their own pace.
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="totalLearningHours">Total learning hours</Label>
          <Input
            id="totalLearningHours"
            className="h-10"
            inputMode="numeric"
            placeholder="120"
            {...register("totalLearningHours")}
          />
          <FieldError message={errors.totalLearningHours?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" rows={4} {...register("description")} />
          <FieldError message={errors.description?.message} />
        </div>
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Learning details</h2>
        <div className="space-y-1.5">
          <Label htmlFor="eligibility">Eligibility / prerequisites</Label>
          <Textarea id="eligibility" rows={2} {...register("eligibility")} />
          <FieldError message={errors.eligibility?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="learningOutcomes">Learning outcomes</Label>
          <Textarea
            id="learningOutcomes"
            rows={4}
            placeholder="One outcome per line"
            {...register("learningOutcomes")}
          />
          <p className="text-muted-foreground text-xs">One outcome per line.</p>
          <FieldError message={errors.learningOutcomes?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="syllabusOutline">Syllabus outline</Label>
          <Textarea
            id="syllabusOutline"
            rows={5}
            placeholder="One topic per line, in order"
            {...register("syllabusOutline")}
          />
          <p className="text-muted-foreground text-xs">
            One topic per line, in teaching order.
          </p>
          <FieldError message={errors.syllabusOutline?.message} />
        </div>
      </div>
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Fee</h2>
        <div className="space-y-1.5">
          <Label htmlFor="defaultFeeRupees">Default fee (₹)</Label>
          <Input
            id="defaultFeeRupees"
            className="h-10"
            inputMode="decimal"
            autoComplete="off"
            {...register("defaultFeeRupees")}
          />
          <p className="text-muted-foreground text-xs">
            Copied to the Fee Plan when a Student is enrolled. It can be
            adjusted there.
          </p>
          <FieldError message={errors.defaultFeeRupees?.message} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
