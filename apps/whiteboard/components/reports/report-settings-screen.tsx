"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Spinner } from "@repo/ui/components/spinner";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { applyHttpFormError } from "@/lib/apply-http-form-error";
import {
  reportQueries,
  updateReportSettings,
  type ReportSettingsResponse,
} from "@/src/queries/reports";

export const MONTH_ITEMS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1), label }));

function wholeNumber(min: number, max: number, message: string) {
  return z
    .string()
    .trim()
    .refine((value) => {
      if (!/^\d+$/.test(value)) return false;
      const number = Number(value);
      return number >= min && number <= max;
    }, message);
}

const schema = z.object({
  thresholdPercent: wholeNumber(1, 100, "Enter a whole % from 1 to 100."),
  absentInARow: wholeNumber(2, 30, "Enter a whole number from 2 to 30."),
  minimumClasses: wholeNumber(1, 60, "Enter a whole number from 1 to 60."),
  academicYearStartMonth: z
    .string()
    .refine(
      (value) => MONTH_ITEMS.some((item) => item.value === value),
      "Choose a month.",
    ),
});

type Values = z.infer<typeof schema>;

function toValues(settings: ReportSettingsResponse): Values {
  return {
    thresholdPercent: String(settings.thresholdPercent),
    absentInARow: String(settings.absentInARow),
    minimumClasses: String(settings.minimumClasses),
    academicYearStartMonth: String(settings.academicYearStartMonth),
  };
}

export function ReportSettingsScreen() {
  const { data } = useSuspenseQuery(reportQueries.settings());
  const queryClient = useQueryClient();
  return (
    <ReportSettingsContent
      settings={data}
      onSave={async (input) => {
        const saved = await updateReportSettings(input);
        queryClient.setQueryData(reportQueries.key.settings(), saved);
        // Every report reads these settings, past periods too.
        await queryClient.invalidateQueries({
          queryKey: reportQueries.key.documents(),
        });
        return saved;
      }}
    />
  );
}

/** The Owner's Report settings form; `onSave` returns what was saved. */
export function ReportSettingsContent({
  settings,
  onSave,
}: {
  settings: ReportSettingsResponse;
  onSave: (input: ReportSettingsResponse) => Promise<ReportSettingsResponse>;
}) {
  const [saved, setSaved] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(settings),
  });

  return (
    <div className="w-full p-4 sm:p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Reports", href: "/reports" }}
          title="Report settings"
          meta="Changes apply to every report straight away, past periods too."
        />
        <form
          noValidate
          aria-label="Report settings"
          className="bg-card space-y-6 rounded-2xl border p-4 shadow-sm sm:p-6"
          onChange={() => {
            setSaved(false);
          }}
          onSubmit={handleSubmit(async (values) => {
            setSaved(false);
            try {
              const next = await onSave({
                thresholdPercent: Number(values.thresholdPercent),
                absentInARow: Number(values.absentInARow),
                minimumClasses: Number(values.minimumClasses),
                academicYearStartMonth: Number(values.academicYearStartMonth),
              });
              reset(toValues(next));
              setSaved(true);
            } catch (error) {
              applyHttpFormError(
                error,
                setError,
                "Could not save Report settings. Please try again.",
              );
            }
          })}
        >
          <FormAlert message={errors.root?.message} />
          <fieldset className="space-y-4">
            <legend className="font-semibold">Low attendance</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="thresholdPercent" required>
                  Attendance threshold (%)
                </Label>
                <Input
                  id="thresholdPercent"
                  aria-required
                  inputMode="numeric"
                  className="h-10"
                  aria-invalid={errors.thresholdPercent != null}
                  aria-describedby="thresholdPercent-hint"
                  {...register("thresholdPercent")}
                />
                <p
                  id="thresholdPercent-hint"
                  className="text-muted-foreground text-xs"
                >
                  Students below this are flagged. Default 75%.
                </p>
                <FieldError message={errors.thresholdPercent?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="absentInARow" required>
                  Absent in a row
                </Label>
                <Input
                  id="absentInARow"
                  aria-required
                  inputMode="numeric"
                  className="h-10"
                  aria-invalid={errors.absentInARow != null}
                  aria-describedby="absentInARow-hint"
                  {...register("absentInARow")}
                />
                <p
                  id="absentInARow-hint"
                  className="text-muted-foreground text-xs"
                >
                  This many absences in a row flags a Student. Default 3.
                </p>
                <FieldError message={errors.absentInARow?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="minimumClasses" required>
                  Minimum Classes
                </Label>
                <Input
                  id="minimumClasses"
                  aria-required
                  inputMode="numeric"
                  className="h-10"
                  aria-invalid={errors.minimumClasses != null}
                  aria-describedby="minimumClasses-hint"
                  {...register("minimumClasses")}
                />
                <p
                  id="minimumClasses-hint"
                  className="text-muted-foreground text-xs"
                >
                  Fewer Classes than this is &ldquo;Too early to judge&rdquo;.
                  Default 4.
                </p>
                <FieldError message={errors.minimumClasses?.message} />
              </div>
            </div>
          </fieldset>
          <fieldset className="space-y-4">
            <legend className="font-semibold">Academic year</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="academicYearStartMonth" required>
                  Starts in
                </Label>
                <Controller
                  name="academicYearStartMonth"
                  control={control}
                  render={({ field }) => (
                    <Select
                      items={MONTH_ITEMS}
                      value={field.value}
                      onValueChange={(value) => {
                        if (value == null) return;
                        field.onChange(value);
                        setSaved(false);
                      }}
                    >
                      <SelectTrigger
                        id="academicYearStartMonth"
                        aria-required
                        size="lg"
                        className="w-full min-w-0"
                        aria-describedby="academicYearStartMonth-hint"
                      >
                        <SelectValue placeholder="Choose a month" />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false}>
                        {MONTH_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p
                  id="academicYearStartMonth-hint"
                  className="text-muted-foreground text-xs"
                >
                  &ldquo;This academic year&rdquo; starts on the 1st of this
                  month. Default June.
                </p>
                <FieldError message={errors.academicYearStartMonth?.message} />
              </div>
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? (
                <Spinner aria-hidden="true" className="size-4" />
              ) : null}
              Save settings
            </Button>
            {saved ? (
              <p
                role="status"
                className="text-sm text-emerald-700 dark:text-emerald-300"
              >
                Settings saved.
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
