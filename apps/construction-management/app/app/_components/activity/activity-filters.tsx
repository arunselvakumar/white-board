"use client";

import { createParser } from "nuqs";
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

/** A range typed back to front is read front to back. */
export function orderedRange(
  from: string | null,
  to: string | null,
): { from: string | null; to: string | null } {
  return from != null && to != null && from > to
    ? { from: to, to: from }
    : { from, to };
}

/** A `YYYY-MM-DD` in the address; anything else reads as no date. */
export const parseAsCalendarDate = createParser({
  parse: (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null),
  serialize: (value: string) => value,
});

/** An id in the address; anything that is not a uuid reads as none. */
export const parseAsUuid = createParser({
  parse: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
      ? value.toLowerCase()
      : null,
  serialize: (value: string) => value,
});
