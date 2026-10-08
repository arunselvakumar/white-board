"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form";
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

import { FieldError } from "@/components/auth/field-error";
import { MoneyInput } from "@/components/money/money-input";

import type { VendorFormValues } from "./vendor-form-schema";
import { emptyRate, emptyShift } from "./vendor-form-schema";

export type CategoryChoice = {
  value: string;
  label: string;
  /** Disabled in Masters: kept where it already is, not offered for new rows. */
  disabled: boolean;
};

type EditorProps = {
  control: Control<VendorFormValues>;
  register: UseFormRegister<VendorFormValues>;
  errors: FieldErrors<VendorFormValues>;
  categories: readonly CategoryChoice[];
  /** False without the Financial flag: rates are hidden and kept as they are. */
  showAmounts: boolean;
};

function ShiftRates({
  shiftIndex,
  control,
  register,
  errors,
  categories,
  showAmounts,
}: EditorProps & { shiftIndex: number }) {
  const rates = useFieldArray({ control, name: `shifts.${shiftIndex}.rates` });
  const chosen = useWatch({ control, name: `shifts.${shiftIndex}.rates` });
  const shiftErrors = errors.shifts?.[shiftIndex];
  const label = (rateIndex: number) =>
    `Shift ${String(shiftIndex + 1)} category ${String(rateIndex + 1)}`;

  return (
    <div className="space-y-2">
      <div
        className="text-muted-foreground hidden gap-2 text-xs font-medium sm:grid"
        style={{
          gridTemplateColumns: showAmounts
            ? "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 2.25rem"
            : "minmax(0,1fr) 2.25rem",
        }}
      >
        <span>Labour Category</span>
        {showAmounts && <span>Rate/day</span>}
        {showAmounts && <span>Overtime/hr</span>}
        <span />
      </div>
      <ul className="space-y-2">
        {rates.fields.map((field, rateIndex) => {
          const rateErrors = shiftErrors?.rates?.[rateIndex];
          const current = chosen[rateIndex]?.labourCategoryId ?? "";
          const items = categories.filter(
            (item) => !item.disabled || item.value === current,
          );
          return (
            <li key={field.id} className="space-y-1">
              <div
                className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 sm:items-start"
                style={
                  showAmounts
                    ? {
                        gridTemplateColumns:
                          "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 2.25rem",
                      }
                    : undefined
                }
              >
                <div className="min-w-0 space-y-1">
                  <Controller
                    name={`shifts.${shiftIndex}.rates.${rateIndex}.labourCategoryId`}
                    control={control}
                    render={({ field: select }) => (
                      <Select
                        items={items}
                        value={select.value === "" ? null : select.value}
                        onValueChange={(value) => {
                          if (value != null) select.onChange(value);
                        }}
                      >
                        <SelectTrigger
                          aria-label={`${label(rateIndex)} Labour Category`}
                          aria-invalid={rateErrors?.labourCategoryId != null}
                          className="w-full min-w-0"
                        >
                          <SelectValue placeholder="Choose a category" />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          alignItemWithTrigger={false}
                          aria-label="Labour Categories"
                        >
                          {items.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError message={rateErrors?.labourCategoryId?.message} />
                </div>
                {showAmounts && (
                  <div className="min-w-0 space-y-1">
                    <MoneyInput
                      aria-label={`${label(rateIndex)} rate per day`}
                      placeholder="Rate/day"
                      aria-invalid={rateErrors?.ratePerDay != null}
                      {...register(
                        `shifts.${shiftIndex}.rates.${rateIndex}.ratePerDay`,
                      )}
                    />
                    <FieldError message={rateErrors?.ratePerDay?.message} />
                  </div>
                )}
                {showAmounts && (
                  <div className="min-w-0 space-y-1">
                    <MoneyInput
                      aria-label={`${label(rateIndex)} overtime per hour`}
                      placeholder="Overtime/hr"
                      aria-invalid={rateErrors?.overtimePerHour != null}
                      {...register(
                        `shifts.${shiftIndex}.rates.${rateIndex}.overtimePerHour`,
                      )}
                    />
                    <FieldError
                      message={rateErrors?.overtimePerHour?.message}
                    />
                  </div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${label(rateIndex)}`}
                  disabled={rates.fields.length === 1}
                  onClick={() => {
                    rates.remove(rateIndex);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <FieldError message={shiftErrors?.rates?.root?.message} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          rates.append(emptyRate());
        }}
      >
        <Plus aria-hidden="true" />
        Add category
      </Button>
    </div>
  );
}

/**
 * The Vendor's rate card (CM-209): shifts with optional times, each with a
 * rate per day and overtime per hour for every Labour Category it supplies.
 */
export function RateCardEditor(props: EditorProps) {
  const { control, register, errors } = props;
  const shifts = useFieldArray({ control, name: "shifts" });

  return (
    <section aria-labelledby="vendor-rate-card" className="space-y-3">
      <div className="space-y-1">
        <h2 id="vendor-rate-card" className="font-semibold">
          Rate card
        </h2>
        <p className="text-muted-foreground text-sm">
          What the Vendor charges per head for a full day, and per overtime
          hour, for each Labour Category on each shift.
          {props.showAmounts
            ? ""
            : " You can change shifts and categories; rates stay as they are."}
        </p>
      </div>
      {shifts.fields.length === 0 && (
        <p
          role="status"
          className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          No rate card. Attendance cannot be recorded for this Vendor until you
          add a shift with at least one Labour Category.
        </p>
      )}
      {shifts.fields.map((field, shiftIndex) => {
        const shiftErrors = errors.shifts?.[shiftIndex];
        const id = (name: string) => `shift-${String(shiftIndex)}-${name}`;
        return (
          <fieldset
            key={field.id}
            aria-label={`Shift ${String(shiftIndex + 1)}`}
            className="bg-card space-y-4 rounded-xl border p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_2.25rem] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor={id("name")}>Shift name</Label>
                <Input
                  id={id("name")}
                  className="h-10"
                  autoComplete="off"
                  aria-invalid={shiftErrors?.name != null}
                  {...register(`shifts.${shiftIndex}.name`)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id("start")}>Start time</Label>
                <Input
                  id={id("start")}
                  type="time"
                  className="h-10"
                  aria-invalid={shiftErrors?.startTime != null}
                  {...register(`shifts.${shiftIndex}.startTime`)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={id("end")}>End time</Label>
                <Input
                  id={id("end")}
                  type="time"
                  className="h-10"
                  aria-invalid={shiftErrors?.endTime != null}
                  {...register(`shifts.${shiftIndex}.endTime`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10"
                aria-label={`Remove Shift ${String(shiftIndex + 1)}`}
                onClick={() => {
                  shifts.remove(shiftIndex);
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            <FieldError
              message={
                shiftErrors?.name?.message ??
                shiftErrors?.startTime?.message ??
                shiftErrors?.endTime?.message
              }
            />
            <ShiftRates {...props} shiftIndex={shiftIndex} />
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          shifts.append(emptyShift(shifts.fields.length));
        }}
      >
        <Plus aria-hidden="true" />
        Add shift
      </Button>
    </section>
  );
}
