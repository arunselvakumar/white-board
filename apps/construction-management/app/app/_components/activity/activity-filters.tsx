"use client";

import { useId } from "react";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

/** A labelled select in a feed's filter row. */
export function ActivityFilterSelect<Value extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: Value;
  items: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <SelectTrigger aria-label={label} className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          aria-label={label}
        >
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

/** From and To dates (inclusive) in a feed's filter row. */
export function ActivityDateRange({
  from,
  to,
  onChange,
}: {
  from: string | null;
  to: string | null;
  onChange: (range: { from: string | null; to: string | null }) => void;
}) {
  const id = useId();
  return (
    <>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${id}-from`}>From</Label>
        <Input
          id={`${id}-from`}
          type="date"
          className="h-10 w-full"
          value={from ?? ""}
          max={to ?? undefined}
          onChange={(event) => {
            onChange({ from: event.target.value || null, to });
          }}
        />
      </div>
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor={`${id}-to`}>To</Label>
        <Input
          id={`${id}-to`}
          type="date"
          className="h-10 w-full"
          value={to ?? ""}
          min={from ?? undefined}
          onChange={(event) => {
            onChange({ from, to: event.target.value || null });
          }}
        />
      </div>
    </>
  );
}
