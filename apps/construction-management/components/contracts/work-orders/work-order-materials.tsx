"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
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
import {
  ResourcePicker,
  type PickerOption,
} from "@/components/contracts/items/resource-picker";
import { MoneyInput } from "@/components/money/money-input";
import { ISSUE_BASIS_LABELS } from "@/src/contracts/domain/contract-terms";
import {
  workOrderMaterialOptionsQuery,
  type WorkOrderBoqItem,
} from "@/src/queries/contracts-work-orders";

import type { WorkOrderValues } from "./work-order-form-schema";
import { quantityInput } from "./work-order-format";

const BASES = [
  { value: "free", label: ISSUE_BASIS_LABELS.free },
  { value: "at_cost", label: ISSUE_BASIS_LABELS.at_cost },
] as const;

type MaterialPick = PickerOption & { uomName: string; unitRate: number | null };

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

/** A Material searched by name on the server. */
function MaterialPicker({
  projectId,
  id,
  label,
  value,
  invalid,
  onChange,
}: {
  projectId: string;
  id: string;
  label: string;
  value: { id: string; name: string } | null;
  invalid: boolean;
  onChange: (pick: MaterialPick | null) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useDebounced(query, 250);
  const results = useQuery({
    ...workOrderMaterialOptionsQuery(projectId, search),
    placeholderData: keepPreviousData,
  });
  const options = useMemo<MaterialPick[]>(
    () =>
      (results.data ?? []).map((option) => ({
        id: option.id,
        label: option.name,
        detail: [option.specification, option.uomName]
          .filter((part): part is string => part != null && part !== "")
          .join(" · "),
        uomName: option.uomName,
        unitRate: option.unitRate,
      })),
    [results.data],
  );
  const selected =
    value == null || value.id === ""
      ? null
      : (options.find((option) => option.id === value.id) ?? {
          id: value.id,
          label: value.name,
          uomName: "",
          unitRate: null,
        });
  return (
    <ResourcePicker<MaterialPick>
      id={id}
      label={label}
      noun="Materials"
      placeholder="Search Materials"
      options={options}
      value={selected}
      onChange={onChange}
      onQueryChange={setQuery}
      loading={results.isPending}
      invalid={invalid}
    />
  );
}

/**
 * Materials the Company issues to the Contractor (CM-0023 §10), in a panel
 * that opens on demand: each with its basis, rates, wastage and a
 * coefficient per line. Picking a Material, or adding a BOQ line, fills
 * the coefficients from the BOQ item's library rate analysis.
 */
export function WorkOrderMaterials({
  projectId,
  control,
  register,
  setValue,
  errors,
  financial,
  boqItems,
}: {
  projectId: string;
  control: Control<WorkOrderValues>;
  register: UseFormRegister<WorkOrderValues>;
  setValue: UseFormSetValue<WorkOrderValues>;
  errors: FieldErrors<WorkOrderValues>;
  financial: boolean;
  boqItems: readonly WorkOrderBoqItem[];
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "materials",
  });
  const lines = useWatch({ control, name: "lines" });
  const materials = useWatch({ control, name: "materials" });
  const [open, setOpen] = useState(fields.length > 0);
  const analysis = useMemo(
    () => new Map(boqItems.map((item) => [item.id, item.analysis])),
    [boqItems],
  );
  /** Coefficients for every line from the rate analysis of its BOQ item. */
  const defaults = (materialId: string): Record<string, string> =>
    Object.fromEntries(
      lines.flatMap((row) => {
        if (row.boqItemId == null) return [];
        const found = analysis
          .get(row.boqItemId)
          ?.find((entry) => entry.materialId === materialId);
        return found == null
          ? []
          : [[row.key, quantityInput(found.coefficient)]];
      }),
    );

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="min-w-0 rounded-xl border"
    >
      <CollapsibleTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto w-full justify-between rounded-xl px-4 py-3 text-left"
          />
        }
      >
        <span className="min-w-0">
          <span className="block font-semibold">
            Materials issued ({fields.length})
          </span>
          <span className="text-muted-foreground block text-xs font-normal whitespace-normal">
            What the Company issues free or at cost, with wastage and the
            quantity per unit of each line (for material reconciliation).
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={
            open ? "rotate-180 transition-transform" : "transition-transform"
          }
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-4 pb-4">
        {fields.map((field, index) => {
          const row = materials[index];
          const prefix = `material-${field.id}`;
          const rowErrors = errors.materials?.[index];
          return (
            <fieldset
              key={field.id}
              className="min-w-0 space-y-3 rounded-lg border p-3"
              aria-label={`Material ${String(index + 1)}`}
            >
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`${prefix}-material`}>Material</Label>
                  <MaterialPicker
                    projectId={projectId}
                    id={`${prefix}-material`}
                    label={`Material ${String(index + 1)}`}
                    value={
                      row == null
                        ? null
                        : { id: row.materialId, name: row.materialName }
                    }
                    invalid={rowErrors?.materialId != null}
                    onChange={(pick) => {
                      setValue(
                        `materials.${index}.materialId`,
                        pick?.id ?? "",
                        {
                          shouldDirty: true,
                        },
                      );
                      setValue(
                        `materials.${index}.materialName`,
                        pick?.label ?? "",
                      );
                      setValue(
                        `materials.${index}.uomName`,
                        pick?.uomName ?? "",
                      );
                      if (pick != null) {
                        setValue(
                          `materials.${index}.coefficients`,
                          defaults(pick.id),
                        );
                        if (
                          financial &&
                          pick.unitRate != null &&
                          (row?.issueRate ?? "") === ""
                        )
                          setValue(
                            `materials.${index}.issueRate`,
                            (pick.unitRate / 100).toFixed(2),
                          );
                      }
                    }}
                  />
                  <FieldError message={rowErrors?.materialId?.message} />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${prefix}-basis`}>Issue basis</Label>
                  <Controller
                    control={control}
                    name={`materials.${index}.issueBasis`}
                    render={({ field: basis }) => (
                      <Select
                        items={BASES}
                        value={basis.value}
                        onValueChange={(value) => {
                          if (value != null) basis.onChange(value);
                        }}
                      >
                        <SelectTrigger
                          id={`${prefix}-basis`}
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          alignItemWithTrigger={false}
                        >
                          {BASES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label htmlFor={`${prefix}-wastage`}>Wastage %</Label>
                  <Input
                    id={`${prefix}-wastage`}
                    inputMode="decimal"
                    aria-invalid={rowErrors?.wastagePercent != null}
                    {...register(`materials.${index}.wastagePercent`)}
                  />
                  <FieldError message={rowErrors?.wastagePercent?.message} />
                </div>
                {financial && row?.issueBasis === "at_cost" ? (
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`${prefix}-issue-rate`}>
                      Issue rate (per{" "}
                      {row.uomName === "" ? "unit" : row.uomName})
                    </Label>
                    <MoneyInput
                      id={`${prefix}-issue-rate`}
                      aria-invalid={rowErrors?.issueRate != null}
                      {...register(`materials.${index}.issueRate`)}
                    />
                    <FieldError message={rowErrors?.issueRate?.message} />
                  </div>
                ) : null}
                {financial ? (
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`${prefix}-penal-rate`}>
                      Penal rate on excess
                    </Label>
                    <MoneyInput
                      id={`${prefix}-penal-rate`}
                      aria-invalid={rowErrors?.penalRate != null}
                      {...register(`materials.${index}.penalRate`)}
                    />
                    <FieldError message={rowErrors?.penalRate?.message} />
                  </div>
                ) : null}
              </div>
              {lines.length === 0 ? null : (
                <div className="min-w-0 space-y-2">
                  <p className="text-sm font-medium">
                    {row?.uomName == null || row.uomName === ""
                      ? "Quantity per unit of each line"
                      : `${row.uomName} per unit of each line`}
                  </p>
                  <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
                    {lines.map((entry, lineIndex) => {
                      const inputId = `${prefix}-coefficient-${entry.key}`;
                      return (
                        <li key={entry.key} className="min-w-0 space-y-1">
                          <Label
                            htmlFor={inputId}
                            className="block truncate text-xs font-normal"
                          >
                            {entry.itemNo === ""
                              ? `Line ${String(lineIndex + 1)}`
                              : entry.itemNo}
                            {entry.description === ""
                              ? ""
                              : ` · ${entry.description}`}
                          </Label>
                          <Input
                            id={inputId}
                            inputMode="decimal"
                            placeholder="None"
                            className="h-8"
                            {...register(
                              `materials.${index}.coefficients.${entry.key}`,
                            )}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    remove(index);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Remove Material
                </Button>
              </div>
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            append({
              materialId: "",
              materialName: "",
              uomName: "",
              issueBasis: "free",
              issueRate: "",
              wastagePercent: "",
              penalRate: "",
              coefficients: {},
            });
          }}
        >
          <Plus aria-hidden="true" />
          Add Material
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
