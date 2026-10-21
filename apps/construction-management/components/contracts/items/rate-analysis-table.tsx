"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
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
import { MoneyInput, paiseToRupees } from "@/components/money/money-input";
import {
  ANALYSIS_KINDS,
  ANALYSIS_KIND_LABELS,
  type AnalysisKind,
} from "@/src/contracts/domain/item-analysis";

import {
  emptyLine,
  lineAmountOf,
  money,
  type ItemFormValues,
} from "./item-form-schema";
import {
  MaterialLinePicker,
  ResourcePicker,
  type PickerOption,
} from "./resource-picker";

const NO_UOM = "none";

/** Desktop columns: kind, resource, quantity per unit, UoM, rate, amount, remove. */
const GRID =
  "sm:grid-cols-[5.5rem_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_6.5rem_2.25rem]";

const QUANTITY_HINT: Record<AnalysisKind, string> = {
  material: "Units of the Material per unit of the Item, like 0.45 bags",
  labour: "Days per unit of the Item",
  equipment: "Hours per unit of the Item",
  lump_sum: "Always 1",
};

export type UomChoice = { value: string; label: string };

/**
 * The Item's rate analysis (CM-1102, ADR CM-0023 §3): a line per
 * resource — a Material, a Labour Category, an Equipment or a lump sum —
 * with its quantity per Item unit, UoM and rate, and the amount worked out
 * as the server does. Add lines with a button per kind; every control is
 * labelled with its line, so the table is usable from the keyboard.
 */
export function RateAnalysisTable({
  control,
  register,
  setValue,
  errors,
  uoms,
  labourCategories,
  equipment,
}: {
  control: Control<ItemFormValues>;
  register: UseFormRegister<ItemFormValues>;
  setValue: UseFormSetValue<ItemFormValues>;
  errors: FieldErrors<ItemFormValues>;
  uoms: readonly UomChoice[];
  labourCategories: readonly PickerOption[];
  equipment: readonly PickerOption[];
}) {
  const lines = useFieldArray({ control, name: "lines" });
  const values = useWatch({ control, name: "lines" });
  const uomItems = [{ value: NO_UOM, label: "—" }, ...uoms];

  return (
    <div className="space-y-3">
      {lines.fields.length === 0 ? (
        <p
          role="status"
          className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
        >
          No rate analysis. Add the materials, labour, equipment and lump sums
          one unit of this Item needs, and the analysed rate is worked out.
        </p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className={`text-muted-foreground hidden gap-2 text-xs font-medium sm:grid ${GRID}`}
          >
            <span>Kind</span>
            <span>Resource</span>
            <span>Qty per unit</span>
            <span>UoM</span>
            <span>Rate</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          <ol
            aria-label="Rate analysis lines"
            className="space-y-3 sm:space-y-2"
          >
            {lines.fields.map((field, index) => {
              const line = values[index] ?? field;
              const kindLabel = ANALYSIS_KIND_LABELS[line.kind];
              const name = `Line ${String(index + 1)}`;
              const lineErrors = errors.lines?.[index];
              const id = (part: string) => `line-${field.id}-${part}`;
              const amount = lineAmountOf(line);
              const resourceValue =
                line.resourceId === ""
                  ? null
                  : { id: line.resourceId, label: line.resourceName };
              const currentUom = uomItems.some(
                (item) => item.value === line.resourceUomId,
              );
              return (
                <li
                  key={field.id}
                  aria-label={`${name}: ${kindLabel}`}
                  className={`grid grid-cols-2 gap-2 rounded-lg border p-3 sm:items-start sm:rounded-none sm:border-0 sm:p-0 ${GRID}`}
                >
                  <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:h-8">
                    <span className="text-sm font-medium">{kindLabel}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="sm:hidden"
                      aria-label={`Remove ${name} (${kindLabel})`}
                      onClick={() => {
                        lines.remove(index);
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
                    <Label
                      htmlFor={id("resource")}
                      className="text-muted-foreground text-xs sm:sr-only"
                    >
                      {line.kind === "lump_sum"
                        ? "Description"
                        : line.kind === "material"
                          ? "Material"
                          : line.kind === "labour"
                            ? "Labour Category"
                            : "Equipment"}
                    </Label>
                    {line.kind === "lump_sum" ? (
                      <Input
                        id={id("resource")}
                        aria-label={`${name} description`}
                        placeholder="Water, sundries…"
                        autoComplete="off"
                        aria-invalid={lineErrors?.description != null}
                        {...register(`lines.${index}.description`)}
                      />
                    ) : (
                      <Controller
                        name={`lines.${index}.resourceId`}
                        control={control}
                        render={({ field: picker }) => {
                          const label = `${name} ${kindLabel === "Labour" ? "Labour Category" : kindLabel}`;
                          const invalid = lineErrors?.resourceId != null;
                          const pick = (
                            option: { id: string; label: string } | null,
                          ) => {
                            setValue(
                              `lines.${index}.resourceId`,
                              option?.id ?? "",
                              { shouldDirty: true, shouldValidate: invalid },
                            );
                            setValue(
                              `lines.${index}.resourceName`,
                              option?.label ?? "",
                            );
                          };
                          if (line.kind === "material")
                            return (
                              <MaterialLinePicker
                                id={id("resource")}
                                label={label}
                                invalid={invalid}
                                inputRef={picker.ref}
                                value={
                                  resourceValue == null
                                    ? null
                                    : {
                                        id: resourceValue.id,
                                        name: resourceValue.label,
                                      }
                                }
                                onChange={(material) => {
                                  pick(material);
                                  if (material == null) return;
                                  if (material.uomId !== "")
                                    setValue(
                                      `lines.${index}.resourceUomId`,
                                      material.uomId,
                                    );
                                  // The Material's rate is a suggestion for a blank rate.
                                  if (
                                    material.unitRate != null &&
                                    (values[index]?.rate ?? "").trim() === ""
                                  )
                                    setValue(
                                      `lines.${index}.rate`,
                                      paiseToRupees(material.unitRate),
                                    );
                                }}
                              />
                            );
                          const options =
                            line.kind === "labour"
                              ? labourCategories
                              : equipment;
                          const known =
                            resourceValue == null
                              ? null
                              : (options.find(
                                  (option) => option.id === resourceValue.id,
                                ) ?? resourceValue);
                          return (
                            <ResourcePicker
                              id={id("resource")}
                              label={label}
                              noun={
                                line.kind === "labour"
                                  ? "Labour Categories"
                                  : "Equipment"
                              }
                              placeholder={
                                line.kind === "labour"
                                  ? "Search Labour Categories"
                                  : "Search Equipment"
                              }
                              options={options}
                              value={known}
                              invalid={invalid}
                              inputRef={picker.ref}
                              onChange={pick}
                            />
                          );
                        }}
                      />
                    )}
                    <FieldError
                      message={
                        lineErrors?.resourceId?.message ??
                        lineErrors?.description?.message
                      }
                    />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor={id("coefficient")}
                      className="text-muted-foreground text-xs sm:sr-only"
                    >
                      Qty per unit
                    </Label>
                    {line.kind === "lump_sum" ? (
                      <p
                        id={id("coefficient")}
                        className="text-muted-foreground flex h-8 items-center text-sm tabular-nums"
                      >
                        1
                      </p>
                    ) : (
                      <Input
                        id={id("coefficient")}
                        aria-label={`${name} quantity per unit`}
                        title={QUANTITY_HINT[line.kind]}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.45"
                        className="tabular-nums"
                        aria-invalid={lineErrors?.coefficient != null}
                        {...register(`lines.${index}.coefficient`)}
                      />
                    )}
                    <FieldError message={lineErrors?.coefficient?.message} />
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor={id("uom")}
                      className="text-muted-foreground text-xs sm:sr-only"
                    >
                      UoM
                    </Label>
                    {line.kind === "lump_sum" ? (
                      <p className="text-muted-foreground flex h-8 items-center text-sm">
                        —
                      </p>
                    ) : (
                      <Controller
                        name={`lines.${index}.resourceUomId`}
                        control={control}
                        render={({ field: select }) => {
                          const items = currentUom
                            ? uomItems
                            : [
                                ...uomItems,
                                {
                                  value: select.value,
                                  label: "Unavailable UoM",
                                },
                              ];
                          return (
                            <Select
                              items={items}
                              value={
                                select.value === "" ? NO_UOM : select.value
                              }
                              onValueChange={(next) => {
                                if (next != null)
                                  select.onChange(next === NO_UOM ? "" : next);
                              }}
                            >
                              <SelectTrigger
                                id={id("uom")}
                                ref={select.ref}
                                aria-label={`${name} UoM`}
                                className="w-full min-w-0"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent
                                align="start"
                                alignItemWithTrigger={false}
                                aria-label="UoMs"
                              >
                                {items.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          );
                        }}
                      />
                    )}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Label
                      htmlFor={id("rate")}
                      className="text-muted-foreground text-xs sm:sr-only"
                    >
                      Rate
                    </Label>
                    <MoneyInput
                      id={id("rate")}
                      aria-label={`${name} rate`}
                      placeholder="0.00"
                      className="h-8"
                      aria-invalid={lineErrors?.rate != null}
                      {...register(`lines.${index}.rate`)}
                    />
                    <FieldError message={lineErrors?.rate?.message} />
                  </div>

                  <div className="min-w-0 space-y-1 text-right">
                    <span className="text-muted-foreground block text-left text-xs sm:sr-only">
                      Amount
                    </span>
                    <p
                      aria-label={`${name} amount`}
                      className="flex h-8 items-center justify-end text-sm font-medium tabular-nums"
                    >
                      {money(amount)}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="hidden sm:inline-flex"
                    aria-label={`Remove ${name} (${kindLabel})`}
                    onClick={() => {
                      lines.remove(index);
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <FieldError
        message={errors.lines?.message ?? errors.lines?.root?.message}
      />
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Add a line"
      >
        {ANALYSIS_KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              lines.append(emptyLine(kind), {
                shouldFocus: true,
                focusName:
                  kind === "lump_sum"
                    ? `lines.${String(lines.fields.length)}.description`
                    : `lines.${String(lines.fields.length)}.resourceId`,
              });
            }}
          >
            <Plus aria-hidden="true" />
            {ANALYSIS_KIND_LABELS[kind]}
          </Button>
        ))}
      </div>
    </div>
  );
}
