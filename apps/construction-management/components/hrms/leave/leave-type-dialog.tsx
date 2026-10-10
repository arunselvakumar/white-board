"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Switch } from "@repo/ui/components/switch";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  ACCRUAL_MODE_LABELS,
  ACCRUAL_MODES,
  LEAVE_TYPE_LIMITS,
} from "@/src/hrms/domain/leave-type";
import {
  useLeaveCommand,
  type LeaveTypeInput,
  type LeaveTypeModel,
} from "@/src/queries/hrms-leave";

const DAYS_RE = /^\d{1,3}(\.\d{1,2})?$/;
const WHOLE_RE = /^\d{1,3}$/;
const SETTINGS_LEVELS = "settings";

const LEVEL_ITEMS = [
  { value: SETTINGS_LEVELS, label: "As in HRMS Settings" },
  { value: "1", label: "1 level" },
  { value: "2", label: "2 levels" },
];

const DAY_ITEMS = Array.from(
  { length: LEAVE_TYPE_LIMITS.maxAccrualDay },
  (_, index) => ({ value: String(index + 1), label: String(index + 1) }),
);

const schema = z
  .object({
    name: z.string().trim().min(1, "Enter the leave type's name").max(60),
    yearlyLimit: z.string().trim().regex(DAYS_RE, "Enter days, like 12 or 1.5"),
    isPaid: z.boolean(),
    requiresApproval: z.boolean(),
    approvalLevels: z.string(),
    maxConsecutiveDays: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || (WHOLE_RE.test(value) && Number(value) > 0),
        "Enter whole days, or leave it empty for no cap",
      ),
    accrualMode: z.enum(ACCRUAL_MODES),
    accrualDay: z.string(),
    creditPerPeriod: z.string().trim(),
    carryForward: z.boolean(),
    maxCarryForward: z.string().trim(),
    allowAdvanceUse: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.accrualMode === "periodic") {
      if (values.accrualDay === "")
        context.addIssue({
          code: "custom",
          path: ["accrualDay"],
          message: "Choose the day the credit is posted",
        });
      if (
        !DAYS_RE.test(values.creditPerPeriod) ||
        Number(values.creditPerPeriod) <= 0
      )
        context.addIssue({
          code: "custom",
          path: ["creditPerPeriod"],
          message: "Enter the days credited each month, like 1.25",
        });
    }
    if (values.carryForward && !DAYS_RE.test(values.maxCarryForward))
      context.addIssue({
        code: "custom",
        path: ["maxCarryForward"],
        message: "Enter the most days that can be carried forward",
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  LEAVE_TYPE_NAME_REQUIRED: "name",
  LEAVE_TYPE_NAME_TOO_LONG: "name",
  LEAVE_TYPE_NAME_IN_USE: "name",
  YEARLY_LIMIT_INVALID: "yearlyLimit",
  YEARLY_LIMIT_REQUIRED_FOR_ACCRUAL: "yearlyLimit",
  APPROVAL_LEVELS_INVALID: "approvalLevels",
  MAX_CONSECUTIVE_DAYS_INVALID: "maxConsecutiveDays",
  CARRY_FORWARD_MAX_REQUIRED: "maxCarryForward",
  CARRY_FORWARD_MAX_INVALID: "maxCarryForward",
  ACCRUAL_DAY_REQUIRED: "accrualDay",
  ACCRUAL_DAY_INVALID: "accrualDay",
  CREDIT_PER_PERIOD_REQUIRED: "creditPerPeriod",
  CREDIT_PER_PERIOD_INVALID: "creditPerPeriod",
};

function toValues(type: LeaveTypeModel | null): Values {
  return {
    name: type?.name ?? "",
    yearlyLimit: type == null ? "" : String(type.yearlyLimit),
    isPaid: type?.isPaid ?? true,
    requiresApproval: type?.requiresApproval ?? true,
    approvalLevels:
      type?.approvalLevels == null
        ? SETTINGS_LEVELS
        : String(type.approvalLevels),
    maxConsecutiveDays:
      type?.maxConsecutiveDays == null ? "" : String(type.maxConsecutiveDays),
    accrualMode: type?.accrualMode ?? "upfront",
    accrualDay: type?.accrualDay == null ? "1" : String(type.accrualDay),
    creditPerPeriod:
      type?.creditPerPeriod == null ? "" : String(type.creditPerPeriod),
    carryForward: type?.carryForward ?? false,
    maxCarryForward:
      type?.maxCarryForward == null ? "" : String(type.maxCarryForward),
    allowAdvanceUse: type?.allowAdvanceUse ?? false,
  };
}

function toInput(values: Values): LeaveTypeInput {
  const periodic = values.accrualMode === "periodic";
  return {
    name: values.name.trim(),
    yearlyLimit: Number(values.yearlyLimit),
    isPaid: values.isPaid,
    requiresApproval: values.requiresApproval,
    approvalLevels:
      values.requiresApproval && values.approvalLevels !== SETTINGS_LEVELS
        ? Number(values.approvalLevels)
        : null,
    maxConsecutiveDays:
      values.maxConsecutiveDays === ""
        ? null
        : Number(values.maxConsecutiveDays),
    accrualMode: values.accrualMode,
    accrualFrequency: periodic ? "monthly" : null,
    accrualDay: periodic ? Number(values.accrualDay) : null,
    creditPerPeriod: periodic ? Number(values.creditPerPeriod) : null,
    carryForward: values.carryForward,
    maxCarryForward: values.carryForward
      ? Number(values.maxCarryForward)
      : null,
    allowAdvanceUse: values.allowAdvanceUse,
  };
}

function SwitchField({
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
      <div className="space-y-0.5">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
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
 * Add or edit a leave type (CM-310): the yearly limit, paid or not, how it
 * is approved, how it is credited (ADR CM-0012 §7) and carried forward.
 */
export function LeaveTypeDialog({
  type,
  open,
  onClose,
}: {
  /** Null adds a new type. */
  type: LeaveTypeModel | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {type == null ? "Add leave type" : `Edit ${type.name}`}
          </DialogTitle>
          <DialogDescription>
            How many days a year, whether they are paid, and how they are
            credited.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <LeaveTypeForm key={type?.id ?? "new"} type={type} onDone={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypeForm({
  type,
  onDone,
}: {
  type: LeaveTypeModel | null;
  onDone: () => void;
}) {
  const command = useLeaveCommand();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(type),
  });
  const { errors } = form.formState;
  const [accrualMode, carryForward, requiresApproval] = useWatch({
    control: form.control,
    name: ["accrualMode", "carryForward", "requiresApproval"],
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const input = toInput(values);
      await command.mutateAsync(
        type == null
          ? { kind: "create-type", input }
          : {
              kind: "update-type",
              id: type.id,
              input,
              expectedUpdatedAt: type.updatedAt,
            },
      );
      onDone();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="leave-type-name">Name</Label>
          <Input
            id="leave-type-name"
            className="h-10"
            aria-invalid={errors.name != null}
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-type-limit">Days a year</Label>
          <Input
            id="leave-type-limit"
            inputMode="decimal"
            className="h-10"
            aria-describedby="leave-type-limit-hint"
            aria-invalid={errors.yearlyLimit != null}
            {...form.register("yearlyLimit")}
          />
          <p
            id="leave-type-limit-hint"
            className="text-muted-foreground text-xs"
          >
            0 for leave with no fixed days, like Compensatory Off or Loss of
            Pay.
          </p>
          <FieldError message={errors.yearlyLimit?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="leave-type-max">Most days in one request</Label>
          <Input
            id="leave-type-max"
            inputMode="numeric"
            className="h-10"
            placeholder="No cap"
            aria-invalid={errors.maxConsecutiveDays != null}
            {...form.register("maxConsecutiveDays")}
          />
          <FieldError message={errors.maxConsecutiveDays?.message} />
        </div>
      </div>

      <Controller
        name="isPaid"
        control={form.control}
        render={({ field }) => (
          <SwitchField
            id="leave-type-paid"
            label="Paid leave"
            hint="Unpaid leave is deducted from salary and needs no balance."
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />

      <div className="space-y-3">
        <Controller
          name="requiresApproval"
          control={form.control}
          render={({ field }) => (
            <SwitchField
              id="leave-type-approval"
              label="Needs approval"
              hint="Otherwise a request is approved as soon as it is made."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        {requiresApproval ? (
          <div className="space-y-1.5 sm:w-1/2">
            <Label htmlFor="leave-type-levels">Approval levels</Label>
            <Controller
              name="approvalLevels"
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
                    id="leave-type-levels"
                    size="lg"
                    className="w-full min-w-0"
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
            <FieldError message={errors.approvalLevels?.message} />
          </div>
        ) : null}
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">How it is credited</legend>
        <Controller
          name="accrualMode"
          control={form.control}
          render={({ field }) => (
            <RadioGroup
              aria-label="How it is credited"
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              className="grid gap-3 sm:grid-cols-3"
            >
              {ACCRUAL_MODES.map((mode) => (
                <div
                  key={mode}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <RadioGroupItem
                    id={`leave-type-accrual-${mode}`}
                    value={mode}
                    aria-describedby={`leave-type-accrual-${mode}-hint`}
                    className="mt-0.5"
                  />
                  <div className="space-y-1">
                    <Label htmlFor={`leave-type-accrual-${mode}`}>
                      {ACCRUAL_MODE_LABELS[mode].label}
                    </Label>
                    <p
                      id={`leave-type-accrual-${mode}-hint`}
                      className="text-muted-foreground text-xs"
                    >
                      {ACCRUAL_MODE_LABELS[mode].hint}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          )}
        />
        {accrualMode === "periodic" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="leave-type-credit">
                Days credited each month
              </Label>
              <Input
                id="leave-type-credit"
                inputMode="decimal"
                className="h-10"
                aria-invalid={errors.creditPerPeriod != null}
                {...form.register("creditPerPeriod")}
              />
              <FieldError message={errors.creditPerPeriod?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="leave-type-day">Credited on day</Label>
              <Controller
                name="accrualDay"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={DAY_ITEMS}
                    value={field.value === "" ? null : field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger
                      id="leave-type-day"
                      size="lg"
                      className="w-32"
                      aria-invalid={errors.accrualDay != null}
                    >
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Days of the month"
                    >
                      {DAY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError message={errors.accrualDay?.message} />
            </div>
          </div>
        ) : null}
      </fieldset>

      <div className="space-y-3">
        <Controller
          name="carryForward"
          control={form.control}
          render={({ field }) => (
            <SwitchField
              id="leave-type-carry"
              label="Carry forward unused days"
              hint="Only when carry forward is also on in HRMS Settings; the Company's cap applies too."
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
        {carryForward ? (
          <div className="space-y-1.5 sm:w-1/2">
            <Label htmlFor="leave-type-carry-max">
              Most days carried forward
            </Label>
            <Input
              id="leave-type-carry-max"
              inputMode="decimal"
              className="h-10"
              aria-invalid={errors.maxCarryForward != null}
              {...form.register("maxCarryForward")}
            />
            <FieldError message={errors.maxCarryForward?.message} />
          </div>
        ) : null}
      </div>

      <Controller
        name="allowAdvanceUse"
        control={form.control}
        render={({ field }) => (
          <SwitchField
            id="leave-type-advance"
            label="Allow advance use"
            hint="Days not yet credited may be taken, up to the yearly limit."
            checked={field.value}
            onCheckedChange={field.onChange}
          />
        )}
      />

      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="submit" disabled={command.isPending}>
          {command.isPending
            ? "Saving…"
            : type == null
              ? "Add leave type"
              : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
