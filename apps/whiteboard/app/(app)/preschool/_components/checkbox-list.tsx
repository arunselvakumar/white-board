"use client";

import { Checkbox } from "@repo/ui/components/checkbox";
import { Label } from "@repo/ui/components/label";

export type CheckboxListItem = { id: string; label: string; detail?: string };

/**
 * Pick several of a short list (Class Teachers, a Teacher's Classrooms):
 * one checkbox per row, in a fieldset named by `legend`.
 */
export function CheckboxList({
  legend,
  items,
  value,
  onChange,
  emptyText,
  idPrefix,
}: {
  legend: string;
  items: readonly CheckboxListItem[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  /** Shown instead of the list when there is nothing to pick. */
  emptyText: string;
  idPrefix: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{legend}</legend>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyText}</p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2">
          {items.map((item) => {
            const id = `${idPrefix}-${item.id}`;
            return (
              <Label
                key={item.id}
                htmlFor={id}
                className="hover:bg-muted/60 flex min-h-10 items-center gap-3 rounded-md px-2 py-1.5 font-normal"
              >
                <Checkbox
                  id={id}
                  checked={value.includes(item.id)}
                  onCheckedChange={(checked) => {
                    onChange(
                      checked
                        ? [...value, item.id]
                        : value.filter((each) => each !== item.id),
                    );
                  }}
                />
                <span className="min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.detail == null ? null : (
                    <span className="text-muted-foreground block truncate text-xs">
                      {item.detail}
                    </span>
                  )}
                </span>
              </Label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
