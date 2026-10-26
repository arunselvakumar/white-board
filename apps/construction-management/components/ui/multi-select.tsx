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

export type MultiSelectOption = { id: string; name: string };

/**
 * Pick any number of records from a searchable list: a tick per chosen
 * row in the list and a chip per chosen record in the field (`Combobox
 * multiple`). Stores ids; ids missing from `options` are dropped on the
 * next change, so pass a saved record that is no longer live in `options`
 * to keep it.
 */
export function MultiSelect({
  id,
  options,
  value,
  onChange,
  placeholder,
  empty,
  listLabel,
  disabled = false,
  invalid = false,
  describedBy,
}: {
  id: string;
  options: readonly MultiSelectOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** Shown while nothing is chosen. */
  placeholder: string;
  /** Shown when the search matches nothing. */
  empty: string;
  /** The list's accessible name, e.g. "Projects". */
  listLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(
    () =>
      value
        .map((chosen) => options.find((item) => item.id === chosen))
        .filter((item): item is MultiSelectOption => item != null),
    [options, value],
  );

  return (
    <Combobox
      items={options as MultiSelectOption[]}
      multiple
      value={selected}
      disabled={disabled}
      itemToStringLabel={(item: MultiSelectOption) => item.name}
      isItemEqualToValue={(item: MultiSelectOption, other: MultiSelectOption) =>
        item.id === other.id
      }
      onValueChange={(next: MultiSelectOption[]) => {
        onChange(next.map((item) => item.id));
      }}
    >
      <ComboboxChips
        ref={anchor}
        className="min-h-10 w-full"
        aria-invalid={invalid || undefined}
      >
        <ComboboxValue>
          {(items: MultiSelectOption[]) => (
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
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                placeholder={items.length > 0 ? "" : placeholder}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{empty}</ComboboxEmpty>
        <ComboboxList aria-label={listLabel}>
          {(item: MultiSelectOption) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
