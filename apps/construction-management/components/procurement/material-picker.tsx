"use client";

import { useQuery } from "@tanstack/react-query";
import {
  NativeSelect,
  NativeSelectOption,
} from "@repo/ui/components/native-select";

import {
  materialOptionsQuery,
  type MaterialOption,
} from "@/src/queries/material-options";

/**
 * Picks one Material for a procurement line (M5). Contract shared by every
 * procurement form: keep these props. CM-501 replaces this basic select
 * with a searchable combobox (and Create New where `allowCreate`).
 */
export type MaterialPickerProps = {
  value: string | null;
  onChange: (material: MaterialOption | null) => void;
  /** Only Materials of this category. */
  categoryId?: string | null;
  /** Materials already on the form, which the picker leaves out. */
  excludeIds?: readonly string[];
  /** Offer "Create New" (adds a Material to the master inline). */
  allowCreate?: boolean;
  id?: string;
  "aria-label"?: string;
  invalid?: boolean;
  disabled?: boolean;
};

export function MaterialPicker(props: MaterialPickerProps) {
  const { data = [] } = useQuery(
    materialOptionsQuery({ categoryId: props.categoryId ?? null }),
  );
  const exclude = new Set(props.excludeIds ?? []);
  const options = data.filter(
    (option) => option.id === props.value || !exclude.has(option.id),
  );
  return (
    <NativeSelect
      id={props.id}
      aria-label={props["aria-label"] ?? "Material"}
      aria-invalid={props.invalid}
      disabled={props.disabled}
      value={props.value ?? ""}
      onChange={(event) => {
        props.onChange(
          options.find((option) => option.id === event.target.value) ?? null,
        );
      }}
    >
      <NativeSelectOption value="">Choose a material</NativeSelectOption>
      {options.map((option) => (
        <NativeSelectOption key={option.id} value={option.id}>
          {option.name} ({option.uomName})
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
