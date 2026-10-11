"use client";

import { useId, type ReactNode } from "react";
import { RadioGroupItem } from "@repo/ui/components/radio-group";
import { cn } from "@repo/ui/lib/utils";

/**
 * One choice of a RadioGroup as a whole clickable card: the card is a
 * `<label>`, a click anywhere on it picks the value, and the radio is named
 * by the title (`aria-labelledby`) and described by the hint. The checked
 * card is outlined in the primary colour.
 */
export function RadioCard({
  value,
  title,
  hint,
  disabled = false,
  onSelect,
  className,
}: {
  value: string;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  /** Picks `value`; the radio group's own change handler, for clicks off the radio. */
  onSelect: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  return (
    <label
      data-disabled={disabled ? "" : undefined}
      className={cn(
        "hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/5 has-focus-visible:ring-ring/50 flex cursor-pointer items-start gap-2 rounded-lg border p-3 transition-colors has-focus-visible:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-60 data-disabled:hover:bg-transparent",
        className,
      )}
      onClick={(event) => {
        // A click on the radio itself is handled by the group.
        if (disabled || (event.target as Element).closest("[role=radio]"))
          return;
        event.preventDefault();
        onSelect(value);
      }}
    >
      <RadioGroupItem
        value={value}
        disabled={disabled}
        aria-labelledby={titleId}
        aria-describedby={hint == null ? undefined : hintId}
        className="mt-0.5"
      />
      <span className="min-w-0 space-y-0.5">
        <span id={titleId} className="block text-sm font-medium">
          {title}
        </span>
        {hint == null ? null : (
          <span id={hintId} className="text-muted-foreground block text-xs">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
