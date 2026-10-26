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

import type { RoleOption } from "@/src/queries/settings";

/**
 * Pick any number of Roles (override Roles on Back-dated Entry, ADR
 * CM-0033). Stores ids; ids of deleted Roles are dropped on change.
 */
export function RoleMultiSelect({
  id,
  roles,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  roles: readonly RoleOption[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const selected = useMemo(
    () => roles.filter((item) => value.includes(item.id)),
    [roles, value],
  );

  return (
    <Combobox
      items={roles as RoleOption[]}
      multiple
      value={selected}
      disabled={disabled}
      itemToStringLabel={(item: RoleOption) => item.name}
      isItemEqualToValue={(item: RoleOption, other: RoleOption) =>
        item.id === other.id
      }
      onValueChange={(next: RoleOption[]) => {
        onChange(next.map((item) => item.id));
      }}
    >
      <ComboboxChips ref={anchor} className="min-h-10 w-full">
        <ComboboxValue>
          {(items: RoleOption[]) => (
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
        <ComboboxEmpty>No Roles found.</ComboboxEmpty>
        <ComboboxList aria-label="Roles">
          {(item: RoleOption) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
