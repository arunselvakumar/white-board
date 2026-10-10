"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { ISO_WEEKDAYS, ISO_WEEKDAY_LABELS } from "@/src/hrms/domain/calendar";
import {
  GPS_REQUIREMENTS,
  HRMS_SETTINGS_LIMITS,
} from "@/src/hrms/domain/hrms-settings";
import { LEAVE_YEAR_SETTINGS } from "@/src/hrms/domain/leave-year";
import {
  hrmsSettingsQuery,
  updateHrmsSettings,
  type HrmsSettingsModel,
} from "@/src/queries/hrms-settings";
import { GST_STATES } from "@/src/shared-kernel/gst-states";

const HOURS_RE = /^\d{1,2}(\.\d{1,2})?$/;
const DAYS_RE = /^\d{1,3}(\.\d{1,2})?$/;
const NO_STATE = "none";

const GPS_OPTIONS: Record<
  (typeof GPS_REQUIREMENTS)[number],
  { label: string; hint: string }
> = {
  disabled: {
    label: "Disabled",
    hint: "Check in without a location.",
  },
  record_only: {
    label: "Record only",
    hint: "The location is saved when the phone gives one. A check-in outside every fence goes to Attendance Approvals.",
  },
  required: {
    label: "Required",
    hint: "A check-in outside every office or site fence is refused.",
  },
};

const LEAVE_YEAR_OPTIONS: Record<
  (typeof LEAVE_YEAR_SETTINGS)[number],
  { label: string; hint: string }
> = {
  calendar: {
    label: "Calendar year",
    hint: "January to December, shown as 2026.",
  },
  financial: {
    label: "Financial year",
    hint: "April to March, shown as 26-27.",
  },
};

const LEVEL_ITEMS = [
  { value: "1", label: "1 level" },
  { value: "2", label: "2 levels" },
];

const SALARY_DAY_ITEMS = Array.from(
  { length: HRMS_SETTINGS_LIMITS.maxSalaryCalculationDay },
  (_, index) => ({ value: String(index + 1), label: String(index + 1) }),
);

const STATE_ITEMS = [
  { value: NO_STATE, label: "None" },
  ...GST_STATES.map((state) => ({ value: state.code, label: state.name })),
];

const schema = z
  .object({
    gpsRequirement: z.enum(GPS_REQUIREMENTS),
    graceMinutes: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Enter whole minutes")
      .refine(
        (value) => Number(value) <= HRMS_SETTINGS_LIMITS.maxGraceMinutes,
        `Use at most ${String(HRMS_SETTINGS_LIMITS.maxGraceMinutes)} minutes`,
      ),
    workingHoursPerDay: z
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
    workingDays: z.array(z.number()).min(1, "Choose at least one working day"),
    leaveApprovalLevels: z.enum(["1", "2"]),
    leaveYear: z.enum(LEAVE_YEAR_SETTINGS),
    carryForwardEnabled: z.boolean(),
    carryForwardMaxDays: z.string().trim(),
    leaveAccrualEnabled: z.boolean(),
    autoSalaryCalculation: z.boolean(),
    salaryCalculationDay: z.string(),
    ptStateCode: z.string(),
  })
  .superRefine((values, context) => {
    if (
      HOURS_RE.test(values.halfDayHours) &&
      HOURS_RE.test(values.workingHoursPerDay) &&
      Number(values.halfDayHours) >= Number(values.workingHoursPerDay)
    )
      context.addIssue({
        code: "custom",
        path: ["halfDayHours"],
        message: "Use fewer hours than a full working day",
      });
    if (values.carryForwardEnabled && !DAYS_RE.test(values.carryForwardMaxDays))
      context.addIssue({
        code: "custom",
        path: ["carryForwardMaxDays"],
        message: "Enter the most days that can be carried forward",
      });
    if (values.autoSalaryCalculation && values.salaryCalculationDay === "")
      context.addIssue({
        code: "custom",
        path: ["salaryCalculationDay"],
        message: "Choose the day salaries are calculated",
      });
  });

type Values = z.infer<typeof schema>;

type ServerField = keyof Values;

const SERVER_FIELDS: Record<string, ServerField> = {
  GPS_REQUIREMENT_INVALID: "gpsRequirement",
  GRACE_MINUTES_INVALID: "graceMinutes",
  WORKING_HOURS_INVALID: "workingHoursPerDay",
  HALF_DAY_HOURS_INVALID: "halfDayHours",
  WORKING_DAYS_INVALID: "workingDays",
  APPROVAL_LEVELS_INVALID: "leaveApprovalLevels",
  LEAVE_YEAR_INVALID: "leaveYear",
  CARRY_FORWARD_MAX_REQUIRED: "carryForwardMaxDays",
  CARRY_FORWARD_MAX_INVALID: "carryForwardMaxDays",
  SALARY_DAY_REQUIRED: "salaryCalculationDay",
  SALARY_DAY_INVALID: "salaryCalculationDay",
  PT_STATE_INVALID: "ptStateCode",
};

function toValues(settings: HrmsSettingsModel): Values {
  return {
    gpsRequirement: settings.gpsRequirement,
    graceMinutes: String(settings.graceMinutes),
    workingHoursPerDay: String(settings.workingHoursPerDay),
    halfDayHours: String(settings.halfDayHours),
    workingDays: settings.workingDays,
    leaveApprovalLevels: settings.leaveApprovalLevels === 2 ? "2" : "1",
    leaveYear: settings.leaveYear,
    carryForwardEnabled: settings.carryForwardEnabled,
    carryForwardMaxDays:
      settings.carryForwardMaxDays == null
        ? ""
        : String(settings.carryForwardMaxDays),
    leaveAccrualEnabled: settings.leaveAccrualEnabled,
    autoSalaryCalculation: settings.autoSalaryCalculation,
    salaryCalculationDay:
      settings.salaryCalculationDay == null
        ? ""
        : String(settings.salaryCalculationDay),
    ptStateCode: settings.ptStateCode ?? NO_STATE,
  };
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-6 rounded-xl border p-6">
      <div className="space-y-1">
        <h3 id={id} className="text-lg font-semibold">
          {title}
        </h3>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-muted-foreground text-xs">
      {children}
    </p>
  );
}

/** A switch with its label and what it does. */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        <Hint id={`${id}-hint`}>{hint}</Hint>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/**
 * HRMS Settings (CM-303): how attendance, leave and salary work for the
 * whole Company. Saves the whole form; a save over someone else's is
 * refused (409) rather than overwriting it.
 */
export function HrmsSettingsForm() {
  const { data: settings } = useSuspenseQuery(hrmsSettingsQuery);
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(settings),
  });
  const mutation = useMutation({ mutationFn: updateHrmsSettings });
  const [carryForwardEnabled, autoSalaryCalculation] = useWatch({
    control: form.control,
    name: ["carryForwardEnabled", "autoSalaryCalculation"],
  });
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    setSaved(false);
    try {
      const next = await mutation.mutateAsync({
        gpsRequirement: values.gpsRequirement,
        graceMinutes: Number(values.graceMinutes),
        workingHoursPerDay: Number(values.workingHoursPerDay),
        halfDayHours: Number(values.halfDayHours),
        workingDays: values.workingDays,
        leaveApprovalLevels: Number(values.leaveApprovalLevels),
        leaveYear: values.leaveYear,
        carryForwardEnabled: values.carryForwardEnabled,
        carryForwardMaxDays: values.carryForwardEnabled
          ? Number(values.carryForwardMaxDays)
          : null,
        leaveAccrualEnabled: values.leaveAccrualEnabled,
        autoSalaryCalculation: values.autoSalaryCalculation,
        salaryCalculationDay: values.autoSalaryCalculation
          ? Number(values.salaryCalculationDay)
          : null,
        ptStateCode:
          values.ptStateCode === NO_STATE ? null : values.ptStateCode,
        expectedUpdatedAt: settings.updatedAt,
      });
      queryClient.setQueryData(hrmsSettingsQuery.queryKey, next);
      form.reset(toValues(next));
      setSaved(true);
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            HRMS Settings
          </h2>
          <p className="text-muted-foreground text-sm">
            How attendance, leave and salary work across your Company.
            {settings.updatedAt == null
              ? " These are the starting values until you save."
              : ""}
          </p>
        </div>

        <form
          noValidate
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <Section
            id="hrms-settings-attendance"
            title="Attendance"
            hint="How check-in works and what counts as a full day."
          >
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">GPS check-in</legend>
              <Controller
                name="gpsRequirement"
                control={form.control}
                render={({ field }) => (
                  <RadioGroup
                    aria-label="GPS check-in"
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                    }}
                    className="grid gap-3 md:grid-cols-3"
                  >
                    {GPS_REQUIREMENTS.map((mode) => (
                      <div
                        key={mode}
                        className="flex items-start gap-3 rounded-lg border p-3"
                      >
                        <RadioGroupItem
                          id={`hrms-gps-${mode}`}
                          value={mode}
                          aria-describedby={`hrms-gps-${mode}-hint`}
                          className="mt-0.5"
                        />
                        <div className="space-y-1">
                          <Label htmlFor={`hrms-gps-${mode}`}>
                            {GPS_OPTIONS[mode].label}
                          </Label>
                          <Hint id={`hrms-gps-${mode}-hint`}>
                            {GPS_OPTIONS[mode].hint}
                          </Hint>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              />
              <FieldError message={errors.gpsRequirement?.message} />
            </fieldset>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="hrms-grace-minutes">Grace period</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hrms-grace-minutes"
                    inputMode="numeric"
                    className="h-10 w-24"
                    aria-describedby="hrms-grace-minutes-hint"
                    aria-invalid={errors.graceMinutes != null}
                    {...form.register("graceMinutes")}
                  />
                  <span className="text-muted-foreground text-sm">minutes</span>
                </div>
                <Hint id="hrms-grace-minutes-hint">
                  A check-in this late is not marked late. A shift&apos;s own
                  grace period wins.
                </Hint>
                <FieldError message={errors.graceMinutes?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hrms-working-hours">
                  Working hours per day
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hrms-working-hours"
                    inputMode="decimal"
                    className="h-10 w-24"
                    aria-describedby="hrms-working-hours-hint"
                    aria-invalid={errors.workingHoursPerDay != null}
                    {...form.register("workingHoursPerDay")}
                  />
                  <span className="text-muted-foreground text-sm">hours</span>
                </div>
                <Hint id="hrms-working-hours-hint">
                  The hours that make a full day, like 8 or 8.5.
                </Hint>
                <FieldError message={errors.workingHoursPerDay?.message} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hrms-half-day-hours">Half-day hours</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hrms-half-day-hours"
                    inputMode="decimal"
                    className="h-10 w-24"
                    aria-describedby="hrms-half-day-hours-hint"
                    aria-invalid={errors.halfDayHours != null}
                    {...form.register("halfDayHours")}
                  />
                  <span className="text-muted-foreground text-sm">hours</span>
                </div>
                <Hint id="hrms-half-day-hours-hint">
                  Worked hours from this up to a full day count as a half day.
                </Hint>
                <FieldError message={errors.halfDayHours?.message} />
              </div>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Working days</legend>
              <Controller
                name="workingDays"
                control={form.control}
                render={({ field }) => (
                  <ToggleGroup
                    multiple
                    aria-describedby="hrms-working-days-hint"
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
              <Hint id="hrms-working-days-hint">
                Other days are week offs. A member&apos;s shift can set its own
                days.
              </Hint>
              <FieldError message={errors.workingDays?.message} />
            </fieldset>
          </Section>

          <Section
            id="hrms-settings-leave"
            title="Leave"
            hint="How leave is approved, counted and credited."
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hrms-approval-levels">Approval levels</Label>
                <Controller
                  name="leaveApprovalLevels"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={LEVEL_ITEMS}
                      value={field.value}
                      onValueChange={(value) => {
                        if (value != null) field.onChange(value);
                      }}
                    >
                      <SelectTrigger
                        id="hrms-approval-levels"
                        size="lg"
                        className="w-full min-w-0"
                        aria-describedby="hrms-approval-levels-hint"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Approval levels"
                      >
                        {LEVEL_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <Hint id="hrms-approval-levels-hint">
                  How many approvers a leave request needs. A leave type can ask
                  for its own.
                </Hint>
                <FieldError message={errors.leaveApprovalLevels?.message} />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Leave year</legend>
                <Controller
                  name="leaveYear"
                  control={form.control}
                  render={({ field }) => (
                    <RadioGroup
                      aria-label="Leave year"
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      className="gap-3 pt-1"
                    >
                      {LEAVE_YEAR_SETTINGS.map((year) => (
                        <div key={year} className="flex items-start gap-3">
                          <RadioGroupItem
                            id={`hrms-leave-year-${year}`}
                            value={year}
                            aria-describedby={`hrms-leave-year-${year}-hint`}
                            className="mt-0.5"
                          />
                          <div className="space-y-0.5">
                            <Label htmlFor={`hrms-leave-year-${year}`}>
                              {LEAVE_YEAR_OPTIONS[year].label}
                            </Label>
                            <Hint id={`hrms-leave-year-${year}-hint`}>
                              {LEAVE_YEAR_OPTIONS[year].hint}
                            </Hint>
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                />
                <FieldError message={errors.leaveYear?.message} />
              </fieldset>
            </div>

            <div className="space-y-4">
              <Controller
                name="carryForwardEnabled"
                control={form.control}
                render={({ field }) => (
                  <SwitchRow
                    id="hrms-carry-forward"
                    label="Carry forward unused leave"
                    hint="Unused days move into the next leave year, for leave types that allow it."
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              {carryForwardEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="hrms-carry-forward-max">
                    Most days carried forward
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="hrms-carry-forward-max"
                      inputMode="decimal"
                      className="h-10 w-24"
                      aria-describedby="hrms-carry-forward-max-hint"
                      aria-invalid={errors.carryForwardMaxDays != null}
                      {...form.register("carryForwardMaxDays")}
                    />
                    <span className="text-muted-foreground text-sm">days</span>
                  </div>
                  <Hint id="hrms-carry-forward-max-hint">
                    The Company&apos;s cap per leave type; each leave
                    type&apos;s own cap applies too.
                  </Hint>
                  <FieldError message={errors.carryForwardMaxDays?.message} />
                </div>
              )}
            </div>

            <Controller
              name="leaveAccrualEnabled"
              control={form.control}
              render={({ field }) => (
                <SwitchRow
                  id="hrms-leave-accrual"
                  label="Credit leave every month"
                  hint="Leave types with a monthly credit get their days on their accrual day."
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </Section>

          <Section
            id="hrms-settings-salary"
            title="Salary"
            hint="When salaries are calculated and which professional tax applies."
          >
            <div className="space-y-4">
              <Controller
                name="autoSalaryCalculation"
                control={form.control}
                render={({ field }) => (
                  <SwitchRow
                    id="hrms-auto-salary"
                    label="Calculate salaries automatically"
                    hint="Otherwise salaries are calculated when someone presses Calculate Salary."
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              {autoSalaryCalculation && (
                <div className="space-y-1.5">
                  <Label htmlFor="hrms-salary-day">Day of the month</Label>
                  <Controller
                    name="salaryCalculationDay"
                    control={form.control}
                    render={({ field }) => (
                      <Select
                        items={SALARY_DAY_ITEMS}
                        value={field.value === "" ? null : field.value}
                        onValueChange={(value) => {
                          if (value != null) field.onChange(value);
                        }}
                      >
                        <SelectTrigger
                          id="hrms-salary-day"
                          size="lg"
                          className="w-32"
                          aria-describedby="hrms-salary-day-hint"
                          aria-invalid={errors.salaryCalculationDay != null}
                        >
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          alignItemWithTrigger={false}
                          aria-label="Days of the month"
                        >
                          {SALARY_DAY_ITEMS.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Hint id="hrms-salary-day-hint">
                    Salaries are calculated on this day each month. Days 29 to
                    31 are not offered because some months lack them.
                  </Hint>
                  <FieldError message={errors.salaryCalculationDay?.message} />
                </div>
              )}
            </div>

            <div className="space-y-1.5 md:w-1/2">
              <Label htmlFor="hrms-pt-state">Professional tax state</Label>
              <Controller
                name="ptStateCode"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={STATE_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="hrms-pt-state"
                      size="lg"
                      className="w-full min-w-0"
                      aria-describedby="hrms-pt-state-hint"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="States"
                    >
                      {STATE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <Hint id="hrms-pt-state-hint">
                Professional tax is worked out from this state&apos;s slabs.
                Choose None if your state has no professional tax, or set a flat
                amount on your salary structures.
              </Hint>
              <FieldError message={errors.ptStateCode?.message} />
            </div>
          </Section>

          <FormAlert message={errors.root?.message} />

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p role="status" className="text-muted-foreground text-sm">
              {saved && !form.formState.isDirty ? "Changes saved." : ""}
            </p>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
