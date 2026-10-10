"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  ISO_WEEKDAY_LABELS,
  type IsoWeekday,
} from "@/src/hrms/domain/calendar";
import {
  CUSTOM_CYCLE_LIMITS,
  ROTATION_TYPES,
  ROTATION_TYPE_LABELS,
  SHIFT_LIMITS,
  cycleLength,
  type RotationType,
} from "@/src/hrms/domain/shift";
import {
  HRMS_SHIFTS_KEY,
  createHrmsRotationTemplate,
  updateHrmsRotationTemplate,
  type HrmsRotationTemplate,
  type HrmsShiftTemplate,
} from "@/src/queries/hrms-shifts";

/** A slot's value in the form: a shift template id, or this for a Week Off. */
const WEEK_OFF = "week_off";

const TYPE_ITEMS = ROTATION_TYPES.map((type) => ({
  value: type,
  label: ROTATION_TYPE_LABELS[type],
}));

const CYCLE_ITEMS = Array.from(
  { length: CUSTOM_CYCLE_LIMITS.maxDays - CUSTOM_CYCLE_LIMITS.minDays + 1 },
  (_, index) => {
    const days = String(index + CUSTOM_CYCLE_LIMITS.minDays);
    return { value: days, label: `${days} days` };
  },
);

const schema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter the rotation name")
      .max(SHIFT_LIMITS.maxNameLength, "Use at most 60 characters"),
    type: z.enum(ROTATION_TYPES),
    daysPerCycle: z.string(),
    slots: z.array(z.string()),
    isActive: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.slots.every((slot) => slot === WEEK_OFF))
      context.addIssue({
        code: "custom",
        path: ["slots"],
        message: "Make at least one day a shift",
      });
  });

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  ROTATION_NAME_REQUIRED: "name",
  ROTATION_NAME_TOO_LONG: "name",
  ROTATION_NAME_TAKEN: "name",
  ROTATION_TYPE_INVALID: "type",
  ROTATION_CYCLE_INVALID: "daysPerCycle",
  ROTATION_SLOTS_INVALID: "slots",
  ROTATION_ALL_WEEK_OFF: "slots",
  ROTATION_SHIFT_INACTIVE: "slots",
  ROTATION_SHIFT_NOT_FOUND: "slots",
};

function slotLabel(type: RotationType, index: number): string {
  if (type === "week") return ISO_WEEKDAY_LABELS[(index + 1) as IsoWeekday];
  return `Day ${String(index + 1)}`;
}

function resize(slots: string[], length: number, fill: string): string[] {
  return Array.from({ length }, (_, index) => slots[index] ?? fill);
}

/**
 * Add or edit a rotation (CM-306): Week (Monday to Sunday), Month (day 1
 * to 31) or a Custom Cycle of 2–12 days counted from the day it is
 * assigned; each day a shift or a Week Off.
 */
export function RotationDialog({
  rotation,
  shifts,
  onClose,
}: {
  /** Null to add. */
  rotation: HrmsRotationTemplate | null;
  /** Every shift template; active ones are offered. */
  shifts: readonly HrmsShiftTemplate[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const firstShift = shifts.find((shift) => shift.isActive)?.id ?? WEEK_OFF;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: rotation?.name ?? "",
      type: rotation?.type ?? "week",
      daysPerCycle: String(
        rotation?.type === "custom_cycle" ? rotation.daysPerCycle : 2,
      ),
      slots:
        rotation?.slots.map((slot) => slot ?? WEEK_OFF) ??
        resize([], 7, firstShift),
      isActive: rotation?.isActive ?? true,
    },
  });
  const errors = form.formState.errors;
  const [fill, setFill] = useState<string | null>(null);
  const [type, slots] = useWatch({
    control: form.control,
    name: ["type", "slots"],
  });
  const used = new Set(rotation?.slots ?? []);
  const options = [
    ...shifts
      .filter((shift) => shift.isActive || used.has(shift.id))
      .map((shift) => ({
        value: shift.id,
        label: shift.isActive ? shift.name : `${shift.name} (inactive)`,
      })),
    { value: WEEK_OFF, label: "Week Off" },
  ];

  const save = useMutation({
    mutationFn: (values: Values) => {
      const body = {
        name: values.name,
        type: values.type,
        daysPerCycle:
          values.type === "custom_cycle" ? Number(values.daysPerCycle) : null,
        slots: values.slots.map((slot) => (slot === WEEK_OFF ? null : slot)),
        isActive: values.isActive,
      };
      return rotation == null
        ? createHrmsRotationTemplate(body)
        : updateHrmsRotationTemplate(rotation.id, {
            ...body,
            expectedUpdatedAt: rotation.updatedAt,
          });
    },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      await queryClient.invalidateQueries({ queryKey: HRMS_SHIFTS_KEY });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  });

  const setLength = (nextType: RotationType, days: string) => {
    form.setValue(
      "slots",
      resize(
        form.getValues("slots"),
        cycleLength(nextType, Number(days)),
        firstShift,
      ),
      { shouldDirty: true },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {rotation == null ? "Add Rotation" : `Edit ${rotation.name}`}
            </DialogTitle>
            <DialogDescription>
              A rotation lets a crew alternate shifts. Week goes by weekday,
              Month by day of the month, and a custom cycle repeats from the day
              it is assigned.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-3">
              <Label htmlFor="rotation-name">Rotation name</Label>
              <Input
                id="rotation-name"
                className="h-10"
                autoComplete="off"
                placeholder="Crew A"
                aria-invalid={errors.name != null}
                {...form.register("name")}
              />
              <FieldError message={errors.name?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rotation-type">Rotation type</Label>
              <Controller
                name="type"
                control={form.control}
                render={({ field }) => (
                  <Select
                    items={TYPE_ITEMS}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value == null) return;
                      field.onChange(value);
                      setLength(value, form.getValues("daysPerCycle"));
                    }}
                  >
                    <SelectTrigger
                      id="rotation-type"
                      size="lg"
                      className="w-full min-w-0"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      alignItemWithTrigger={false}
                      aria-label="Rotation types"
                    >
                      {TYPE_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            {type === "custom_cycle" ? (
              <div className="space-y-1.5">
                <Label htmlFor="rotation-days">Days per cycle</Label>
                <Controller
                  name="daysPerCycle"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      items={CYCLE_ITEMS}
                      value={field.value}
                      onValueChange={(value) => {
                        if (value == null) return;
                        field.onChange(value);
                        setLength("custom_cycle", value);
                      }}
                    >
                      <SelectTrigger
                        id="rotation-days"
                        size="lg"
                        className="w-full min-w-0"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        align="start"
                        alignItemWithTrigger={false}
                        aria-label="Days per cycle"
                      >
                        {CYCLE_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.daysPerCycle?.message} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="rotation-fill">Set every day to</Label>
              <Select
                items={options}
                value={fill}
                onValueChange={(value: string | null) => {
                  if (value == null) return;
                  setFill(value);
                  form.setValue(
                    "slots",
                    form.getValues("slots").map(() => value),
                    { shouldDirty: true },
                  );
                }}
              >
                <SelectTrigger
                  id="rotation-fill"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  aria-label="Shifts for every day"
                >
                  {options.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Cycle shifts ({slots.length} days)
            </legend>
            <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {slots.map((_slot, index) => {
                const id = `rotation-slot-${String(index)}`;
                const label = slotLabel(type, index);
                return (
                  <li key={id} className="flex items-center gap-2">
                    <Label
                      htmlFor={id}
                      className="text-muted-foreground w-24 shrink-0 text-sm font-normal"
                    >
                      {label}
                    </Label>
                    <Controller
                      name={`slots.${index}`}
                      control={form.control}
                      render={({ field }) => (
                        <Select
                          items={options}
                          value={field.value}
                          onValueChange={(value) => {
                            if (value != null) field.onChange(value);
                          }}
                        >
                          <SelectTrigger id={id} className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent
                            align="start"
                            alignItemWithTrigger={false}
                            aria-label={`Shifts for ${label}`}
                          >
                            {options.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </li>
                );
              })}
            </ol>
            <FieldError
              message={errors.slots?.message ?? errors.slots?.root?.message}
            />
          </fieldset>
          <Controller
            name="isActive"
            control={form.control}
            render={({ field }) => (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="rotation-active">Active</Label>
                  <p
                    id="rotation-active-hint"
                    className="text-muted-foreground text-xs"
                  >
                    Inactive rotations are not offered in Shift Management.
                  </p>
                </div>
                <Switch
                  id="rotation-active"
                  aria-describedby="rotation-active-hint"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </div>
            )}
          />
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save rotation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
