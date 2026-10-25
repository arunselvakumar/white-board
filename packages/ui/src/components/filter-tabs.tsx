"use client";

import type * as React from "react";
import { cn } from "cn";

import { Tabs, TabsCount, TabsList, TabsTrigger } from "./tabs";

export type FilterTab<Value extends string> = {
  value: Value;
  label: React.ReactNode;
  /** Drawn left of the label, as in the sidebar. */
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** How many rows this filter shows; left out, no count is drawn. */
  count?: number;
  disabled?: boolean;
};

/**
 * A list's filter as a row of underline tabs (no panels: the list below
 * is what changes). Each tab has an icon, a label and an optional count.
 */
function FilterTabs<Value extends string>({
  items,
  value,
  onValueChange,
  className,
  listClassName,
  "aria-label": label,
}: {
  items: readonly FilterTab<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  className?: string;
  listClassName?: string;
  "aria-label": string;
}) {
  return (
    <Tabs
      data-slot="filter-tabs"
      value={value}
      onValueChange={(next: Value) => {
        onValueChange(next);
      }}
      className={cn("min-w-0", className)}
    >
      <TabsList aria-label={label} className={listClassName}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
            >
              {Icon == null ? null : <Icon aria-hidden />}
              {item.label}
              {item.count == null ? null : <TabsCount>{item.count}</TabsCount>}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}

export { FilterTabs };
