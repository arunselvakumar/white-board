"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@repo/ui/components/checkbox";
import { cn } from "@repo/ui/lib/utils";

export type CheckListOption = {
  id: string;
  label: string;
  /** Shown after the label, e.g. a status badge. */
  trailing?: ReactNode;
};

/**
 * A bordered list of checkboxes (Projects for an Amenity, Amenities for a
 * Project). Keeps the options' order; `value` is the ticked ids.
 */
export function CheckList({
  legend,
  legendHidden = false,
  idPrefix,
  options,
  value,
  onChange,
  className,
}: {
  legend: string;
  /** The legend names the group for screen readers only. */
  legendHidden?: boolean;
  /** Makes the checkbox ids unique on the page. */
  idPrefix: string;
  options: readonly CheckListOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const chosen = new Set(value);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    onChange(
      [
        ...options.map((option) => option.id),
        ...value.filter((id) => !options.some((option) => option.id === id)),
      ].filter((item) => next.has(item)),
    );
  };
  return (
    <fieldset className={cn("min-w-0 space-y-2", className)}>
      <legend
        className={cn("text-sm font-medium", legendHidden ? "sr-only" : "mb-2")}
      >
        {legend}
      </legend>
      <ul className="bg-card divide-y rounded-xl border">
        {options.map((option) => {
          const id = `${idPrefix}-${option.id}`;
          return (
            <li key={option.id}>
              <label
                htmlFor={id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3"
              >
                <Checkbox
                  id={id}
                  checked={chosen.has(option.id)}
                  onCheckedChange={(checked) => {
                    toggle(option.id, checked);
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {option.label}
                </span>
                {option.trailing}
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
