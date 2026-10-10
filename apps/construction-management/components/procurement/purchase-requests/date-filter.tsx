"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import {
  DATE_PRESETS,
  datePresetRange,
  type DatePreset,
} from "@/src/procurement/domain/purchase-request-date-presets";

import { FilterSelect } from "./filter-select";

export type DateFilterValue = {
  preset: DatePreset | "";
  from: string;
  to: string;
};

export const NO_DATE_FILTER: DateFilterValue = { preset: "", from: "", to: "" };

/** Date: This Week … Last Month, or Custom with From / To (`modules/06`). */
export function DateFilter({
  idPrefix,
  value,
  today,
  onChange,
}: {
  idPrefix: string;
  value: DateFilterValue;
  today: string;
  onChange: (value: DateFilterValue) => void;
}) {
  return (
    <>
      <FilterSelect
        id={`${idPrefix}-date`}
        label="Date"
        allLabel="Any date"
        value={value.preset}
        options={DATE_PRESETS.map((item) => ({ value: item.key, label: item.label }))}
        onChange={(next) => {
          const preset = next as DatePreset | "";
          if (preset === "") {
            onChange(NO_DATE_FILTER);
            return;
          }
          const range = datePresetRange(preset, today);
          onChange({
            preset,
            from: range?.from ?? value.from,
            to: range?.to ?? value.to,
          });
        }}
      />
      {value.preset === "custom" && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-from`} className="text-xs">
              From
            </Label>
            <Input
              id={`${idPrefix}-from`}
              type="date"
              className="h-8 w-36"
              value={value.from}
              onChange={(event) => {
                onChange({ ...value, from: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-to`} className="text-xs">
              To
            </Label>
            <Input
              id={`${idPrefix}-to`}
              type="date"
              className="h-8 w-36"
              value={value.to}
              onChange={(event) => {
                onChange({ ...value, to: event.target.value });
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
