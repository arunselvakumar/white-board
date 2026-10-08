"use client";

import { useMemo } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@repo/ui/components/combobox";

import type { DesignationOption } from "@/src/queries/settings";

/**
 * Pick any number of Designations (override Designations on Back-dated
 * Entry). Stores ids; ids of deleted Designations are dropped on change.
 */
export function DesignationMultiSelect({
  id,
  designations,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  designations: readonly DesignationOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(
    () => designations.filter((item) => value.includes(item.id)),
    [designations, value],
  );

  return (
    <Combobox
      items={designations as DesignationOption[]}
      multiple
      value={selected}
      disabled={disabled}
      itemToStringLabel={(item: DesignationOption) => item.name}
      isItemEqualToValue={(item: DesignationOption, other: DesignationOption) =>
        item.id === other.id
      }
      onValueChange={(next: DesignationOption[]) => {
        onChange(next.map((item) => item.id));
      }}
    >
      <ComboboxChips ref={anchor} className="min-h-10 w-full">
        <ComboboxValue>
          {(items: DesignationOption[]) => (
            <>
              {items.map((item) => (
                <ComboboxChip
                  key={item.id}
                  aria-label={item.name}
                  removeLabel={`Remove ${item.name}`}
                >
                  {item.name}
                </ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                disabled={disabled}
                placeholder={items.length > 0 ? "" : "No override"}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No Designations found.</ComboboxEmpty>
        <ComboboxList aria-label="Designations">
          {(item: DesignationOption) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
