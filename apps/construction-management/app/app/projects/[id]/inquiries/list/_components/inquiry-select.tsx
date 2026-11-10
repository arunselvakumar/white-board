"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

const NONE = "__none";

export type InquiryOption = { value: string; label: string };

/** A Select with a "none" first item; `""` is none. */
export function InquirySelect({
  id,
  value,
  onChange,
  items,
  noneLabel,
  invalid,
  required = false,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly InquiryOption[];
  /** The first item; omit for a required pick (no none). */
  noneLabel?: string;
  invalid?: boolean;
  /** Sets `aria-required` on the trigger; the label shows the asterisk. */
  required?: boolean;
  disabled?: boolean;
}) {
  const all: InquiryOption[] =
    noneLabel == null
      ? [...items]
      : [{ value: NONE, label: noneLabel }, ...items];
  return (
    <Select
      items={all}
      value={value === "" ? (noneLabel == null ? null : NONE) : value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === NONE ? "" : next);
      }}
    >
      <SelectTrigger
        id={id}
        className="w-full min-w-0"
        aria-invalid={invalid}
        aria-required={required}
      >
        <SelectValue placeholder={noneLabel ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {all.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Keeps an unchanged pick the options no longer offer (disabled, removed). */
export function withCurrentOption(
  options: InquiryOption[],
  current: { id: string; name: string | null } | null | undefined,
  missing: string,
): InquiryOption[] {
  if (current == null || options.some((item) => item.value === current.id))
    return options;
  return [
    ...options,
    {
      value: current.id,
      label: `${current.name ?? "A removed entry"} (${missing})`,
    },
  ];
}
