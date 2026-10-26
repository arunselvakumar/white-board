"use client";

/**
 * The wage set-up fields (ADR CM-0033): type, amount, overtime per hour,
 * working hours per day and weekly holidays, for the nested object `name`
 * of a react-hook-form form (see `wage-schema.ts`). Add and Edit Labour use
 * it as "Wage"; Add and Edit Staff as "Salary":
 *
 * ```tsx
 * <WageFields
 *   form={form}
 *   name="salary"
 *   idPrefix="staff"
 *   options={STAFF_SALARY}
 *   showAmounts={canSeeSalary}
 * />
 * ```
 *
 * `children` go after the amounts, before the weekly holidays (Labour puts
 * its opening balance there). The caller draws the card around it.
 */
import type { ReactNode } from "react";
import {
  Controller,
  useWatch,
  type FieldPath,
  type FieldValues,
  type UseFormReturn,
} from "react-hook-form";
import { Input } from "@repo/ui/components/input";
import { Label, RequiredIndicator } from "@repo/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { MoneyInput } from "@/components/money/money-input";

import {
  WEEKDAYS,
  amountKey,
  hasAmount,
  type WageOptions,
  type WageValues,
} from "./wage-schema";

/** The words on screen for each noun; Labour's are unchanged. */
const WORDS = {
  Wage: {
    type: "Wage type",
    daily: "Daily wages",
    monthly: "Monthly wages",
    perDay: "Wage per day",
    perMonth: "Wage per month",
    overtime: "Overtime wage per hour",
    holidays: "Attendance marks these days Holiday by default.",
  },
  Salary: {
    type: "Salary type",
    daily: "Daily",
    monthly: "Monthly",
    perDay: "Salary per day",
    perMonth: "Salary per month",
    overtime: "Overtime per hour",
    holidays: "Their days off each week.",
  },
} as const;

export function WageFields<Values extends FieldValues>({
  form,
  name,
  idPrefix,
  options,
  showAmounts = true,
  showType = true,
  children,
}: {
  form: UseFormReturn<Values>;
  /** The nested object holding `WageValues`, e.g. `"wage"` or `"salary"`. */
  name: string;
  /** Prefix of the input ids, e.g. `"labour"` → `labour-wage-day`. */
  idPrefix: string;
  options: WageOptions;
  /** False without Financial: the amounts are neither shown nor sent. */
  showAmounts?: boolean;
  /**
   * False hides the type toggle. Staff pass their Financial right: without
   * it the API ignores the type, which only picks the amount that applies.
   */
  showType?: boolean;
  children?: ReactNode;
}) {
  const words = WORDS[options.noun];
  const path = (key: keyof WageValues) => `${name}.${key}` as FieldPath<Values>;
  const errorOf = (key: keyof WageValues) =>
    form.getFieldState(path(key), form.formState).error?.message;
  const values = useWatch({
    control: form.control,
    name: name as FieldPath<Values>,
  }) as WageValues;
  const id = `${idPrefix}-${options.noun.toLowerCase()}`;
  const key = amountKey(values.type);
  const showOvertime =
    showAmounts && (!options.overtimeOnlyWithAmount || hasAmount(values));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <fieldset className={showType ? "space-y-1.5" : "hidden"}>
        <legend className="text-sm font-medium">
          {words.type}
          <RequiredIndicator />
        </legend>
        <Controller
          name={path("type")}
          control={form.control}
          render={({ field }) => (
            <ToggleGroup
              value={[field.value as string]}
              onValueChange={(value: string[]) => {
                const next = value[0];
                if (next === "daily" || next === "monthly")
                  field.onChange(next);
              }}
              variant="outline"
            >
              <ToggleGroupItem value="daily">{words.daily}</ToggleGroupItem>
              <ToggleGroupItem value="monthly">{words.monthly}</ToggleGroupItem>
            </ToggleGroup>
          )}
        />
      </fieldset>
      {showAmounts && (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`${id}-${key === "perDay" ? "day" : "month"}`} required={options.required}>
            {key === "perDay" ? words.perDay : words.perMonth}
          </Label>
          <MoneyInput
            id={`${id}-${key === "perDay" ? "day" : "month"}`}
            className="h-10"
            placeholder={key === "perDay" ? "700" : "18000"}
            aria-describedby={options.required ? undefined : `${id}-hint`}
            aria-required={options.required}
            aria-invalid={errorOf(key) != null}
            {...form.register(path(key))}
          />
          {!options.required && (
            <p id={`${id}-hint`} className="text-muted-foreground text-xs">
              Leave blank for none.
            </p>
          )}
          <FieldError message={errorOf(key)} />
        </div>
      )}
      {showOvertime && (
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-overtime`} required>
            {words.overtime}
          </Label>
          <MoneyInput
            id={`${idPrefix}-overtime`}
            className="h-10"
            placeholder="100"
            aria-required
            aria-invalid={errorOf("overtimePerHour") != null}
            {...form.register(path("overtimePerHour"))}
          />
          <FieldError message={errorOf("overtimePerHour")} />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-working-hours`} required>
          Working hours per day
        </Label>
        <Input
          id={`${idPrefix}-working-hours`}
          inputMode="decimal"
          className="h-10"
          placeholder="8"
          aria-describedby={`${idPrefix}-working-hours-hint`}
          aria-required
          aria-invalid={errorOf("workingHoursPerDay") != null}
          {...form.register(path("workingHoursPerDay"))}
        />
        <p
          id={`${idPrefix}-working-hours-hint`}
          className="text-muted-foreground text-xs"
        >
          Time worked beyond this is overtime.
        </p>
        <FieldError message={errorOf("workingHoursPerDay")} />
      </div>
      {children}
      <fieldset className="space-y-1.5 sm:col-span-2">
        <legend className="text-sm font-medium">Weekly holidays</legend>
        <Controller
          name={path("weeklyHolidays")}
          control={form.control}
          render={({ field }) => (
            <ToggleGroup
              multiple
              value={(field.value as number[]).map(String)}
              onValueChange={(value: string[]) => {
                field.onChange(value.map(Number));
              }}
              variant="outline"
              size="sm"
              className="flex-wrap"
            >
              {WEEKDAYS.map((day) => (
                <ToggleGroupItem key={day.value} value={String(day.value)}>
                  {day.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        />
        <p className="text-muted-foreground text-xs">{words.holidays}</p>
        <FieldError message={errorOf("weeklyHolidays")} />
      </fieldset>
    </div>
  );
}
