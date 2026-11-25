"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type UseFormRegister } from "react-hook-form";
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

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { MAX_PROGRAMME_AGE_MONTHS } from "@/src/preschool/domain/programme";
import { QueryHttpError } from "@/src/queries/http";
import type {
  PreschoolProgramme,
  PreschoolProgrammeInput,
} from "@/src/queries/preschool/programmes";

const wholeNumber = (max: number, message: string) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" || (/^\d{1,3}$/.test(value) && Number(value) <= max),
      message,
    );

/** Blank years and months together mean no limit; one blank counts as 0. */
function months(years: string, rest: string): number | null {
  if (years === "" && rest === "") return null;
  return Number(years || "0") * 12 + Number(rest || "0");
}

const schema = z
  .object({
    name: z.string().trim().min(1, "Programme name is required").max(100),
    minYears: wholeNumber(10, "Enter 0 to 10 years"),
    minMonths: wholeNumber(11, "Enter 0 to 11 months"),
    maxYears: wholeNumber(10, "Enter 0 to 10 years"),
    maxMonths: wholeNumber(11, "Enter 0 to 11 months"),
    isDaycare: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const min = months(value.minYears, value.minMonths);
    const max = months(value.maxYears, value.maxMonths);
    for (const [total, path] of [
      [min, "minYears"],
      [max, "maxYears"],
    ] as const)
      if (total != null && total > MAX_PROGRAMME_AGE_MONTHS)
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "An age can be at most 10 years",
        });
    if (min != null && max != null && min > max)
      ctx.addIssue({
        code: "custom",
        path: ["maxYears"],
        message: "The oldest age must not be below the youngest age",
      });
  });

type FormValues = z.infer<typeof schema>;

function split(total: number | null): { years: string; months: string } {
  if (total == null) return { years: "", months: "" };
  return { years: String(Math.floor(total / 12)), months: String(total % 12) };
}

function toValues(programme: PreschoolProgramme | null): FormValues {
  const min = split(programme?.minAgeMonths ?? null);
  const max = split(programme?.maxAgeMonths ?? null);
  return {
    name: programme?.name ?? "",
    minYears: min.years,
    minMonths: min.months,
    maxYears: max.years,
    maxMonths: max.months,
    isDaycare: programme?.isDaycare ?? false,
  };
}

function AgeFields({
  legend,
  prefix,
  register,
  error,
}: {
  legend: string;
  prefix: "min" | "max";
  register: UseFormRegister<FormValues>;
  error: string | undefined;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["Years", "Months"] as const).map((unit) => (
          <div key={unit} className="space-y-1">
            <Label
              htmlFor={`programme-${prefix}-${unit}`}
              className="text-muted-foreground text-xs font-normal"
            >
              {unit}
            </Label>
            <Input
              id={`programme-${prefix}-${unit}`}
              aria-label={`${legend}, ${unit.toLowerCase()}`}
              className="h-10"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={error != null}
              {...register(`${prefix}${unit}`)}
            />
          </div>
        ))}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}

function ProgrammeForm({
  programme,
  title,
  onCancel,
  onSubmit,
}: {
  programme: PreschoolProgramme | null;
  title: string;
  onCancel: () => void;
  onSubmit: (input: PreschoolProgrammeInput) => Promise<void>;
}) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toValues(programme),
  });

  return (
    <form
      noValidate
      aria-label={title}
      className="space-y-4"
      onSubmit={handleSubmit(async (values) => {
        try {
          await onSubmit({
            name: values.name,
            minAgeMonths: months(values.minYears, values.minMonths),
            maxAgeMonths: months(values.maxYears, values.maxMonths),
            isDaycare: values.isDaycare,
          });
        } catch (error) {
          if (
            error instanceof QueryHttpError &&
            error.code.startsWith("PROGRAMME_NAME")
          )
            setError("name", { message: error.message });
          else
            setError("root", {
              message:
                error instanceof QueryHttpError
                  ? error.message
                  : "Could not save this Programme. Please try again.",
            });
        }
      })}
    >
      <FormAlert message={errors.root?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="programme-name" required>
          Programme name
        </Label>
        <Input
          id="programme-name"
          className="h-10"
          aria-required
          autoComplete="off"
          placeholder="Nursery (Pre-KG)"
          aria-invalid={errors.name != null}
          {...register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <AgeFields
          legend="Youngest age"
          prefix="min"
          register={register}
          error={errors.minYears?.message ?? errors.minMonths?.message}
        />
        <AgeFields
          legend="Oldest age"
          prefix="max"
          register={register}
          error={errors.maxYears?.message ?? errors.maxMonths?.message}
        />
      </div>
      <Controller
        name="isDaycare"
        control={control}
        render={({ field }) => (
          <div className="flex items-start gap-3">
            <Switch
              id="programme-daycare"
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
              }}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="programme-daycare">Daycare</Label>
              <p className="text-muted-foreground text-xs">
                Care for the day rather than a class level.
              </p>
            </div>
          </div>
        )}
      />
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save Programme"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Add or edit a Programme. Ages are entered as years and months. */
export function ProgrammeFormDialog({
  open,
  programme,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** The Programme to edit; null adds one. */
  programme: PreschoolProgramme | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: PreschoolProgrammeInput) => Promise<void>;
}) {
  const title = programme == null ? "Add Programme" : "Edit Programme";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Ages are on the first day of the Academic Year. Leave both blank for
            no limit.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so each opening starts from the Programme's saved values. */}
        <ProgrammeForm
          key={programme?.id ?? "new"}
          programme={programme}
          title={title}
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
