"use client";

import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import {
  DURATION_PRESETS,
  browserToday,
  presetDuration,
  type Duration,
} from "@/lib/dashboard-duration";

/**
 * Filter duration (CM-412): presets ending today, or a custom range of at
 * most a year.
 */
export function DurationFilter({
  value,
  onChange,
}: {
  value: Duration;
  onChange: (next: Duration) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Select
        items={DURATION_PRESETS.map((preset) => ({
          value: preset.value,
          label: preset.label,
        }))}
        value={value.preset}
        onValueChange={(next) => {
          if (next == null || next === value.preset) return;
          const preset = next;
          onChange(
            preset === "custom"
              ? { ...value, preset }
              : presetDuration(preset, browserToday()),
          );
        }}
      >
        <SelectTrigger aria-label="Duration" className="h-10 w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          aria-label="Duration"
        >
          {DURATION_PRESETS.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.preset === "custom" ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-end">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="dashboard-from" className="text-xs">
              From
            </Label>
            <Input
              id="dashboard-from"
              type="date"
              className="h-10 w-full sm:w-40"
              max={value.to}
              value={value.from}
              onChange={(event) => {
                if (event.target.value === "") return;
                onChange({ ...value, from: event.target.value });
              }}
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label htmlFor="dashboard-to" className="text-xs">
              To
            </Label>
            <Input
              id="dashboard-to"
              type="date"
              className="h-10 w-full sm:w-40"
              min={value.from}
              value={value.to}
              onChange={(event) => {
                if (event.target.value === "") return;
                onChange({ ...value, to: event.target.value });
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
