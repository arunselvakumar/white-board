"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Label } from "@repo/ui/components/label";

const ALL = "__all";

/** A labelled filter select with an "All" option; `""` means all. */
export function FilterSelect({
  id,
  label,
  value,
  options,
  allLabel = "All",
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  allLabel?: string;
  onChange: (value: string) => void;
}) {
  const items = [{ value: ALL, label: allLabel }, ...options];
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select
        items={items}
        value={value === "" ? ALL : value}
        onValueChange={(next) => {
          onChange(next == null || next === ALL ? "" : next);
        }}
      >
        <SelectTrigger id={id} size="sm" className="w-full min-w-0 sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
