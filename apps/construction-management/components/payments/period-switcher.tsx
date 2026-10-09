"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import type { BalancePeriod, BalancePeriodKind } from "@/src/queries/balances";

import { periodLabel, rangeOf, shiftPeriod } from "./payment-format";

const KINDS: { value: BalancePeriodKind; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
];

/**
 * Monthly / Weekly (Monday to Sunday) / Custom, with previous and next for
 * the first two and a date range for Custom (CM-216).
 */
export function PeriodSwitcher({
  value,
  onChange,
}: {
  value: BalancePeriod;
  onChange: (next: BalancePeriod) => void;
}) {
  const range = rangeOf(value);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <ToggleGroup
        aria-label="Period"
        value={[value.kind]}
        onValueChange={(next: string[]) => {
          const kind = next[0] as BalancePeriodKind | undefined;
          if (kind == null || kind === value.kind) return;
          // Custom starts as the days in view; month and week keep the anchor day.
          onChange(
            kind === "custom"
              ? { kind, anchor: range.from, to: range.to }
              : { kind, anchor: value.anchor },
          );
        }}
        variant="outline"
        size="sm"
      >
        {KINDS.map((kind) => (
          <ToggleGroupItem key={kind.value} value={kind.value}>
            {kind.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.kind === "custom" ? (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="period-from" className="text-xs">
              From
            </Label>
            <Input
              id="period-from"
              type="date"
              className="h-8 w-40"
              value={value.anchor}
              onChange={(event) => {
                const from = event.target.value;
                if (from === "") return;
                const to =
                  value.to != null && value.to >= from ? value.to : from;
                onChange({ kind: "custom", anchor: from, to });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="period-to" className="text-xs">
              To
            </Label>
            <Input
              id="period-to"
              type="date"
              className="h-8 w-40"
              min={value.anchor}
              value={value.to ?? value.anchor}
              onChange={(event) => {
                const to = event.target.value;
                if (to === "" || to < value.anchor) return;
                onChange({ kind: "custom", anchor: value.anchor, to });
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={
              value.kind === "monthly" ? "Previous month" : "Previous week"
            }
            onClick={() => {
              onChange(shiftPeriod(value, -1));
            }}
          >
            <ChevronLeft />
          </Button>
          <p
            aria-live="polite"
            className="min-w-44 px-2 text-center text-sm font-medium"
          >
            {periodLabel(value)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label={value.kind === "monthly" ? "Next month" : "Next week"}
            onClick={() => {
              onChange(shiftPeriod(value, 1));
            }}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
