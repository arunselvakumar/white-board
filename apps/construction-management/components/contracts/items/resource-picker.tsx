"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useEffect, useMemo, useState, type Ref } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@repo/ui/components/combobox";
import {
  InputGroupAddon,
  InputGroupButton,
} from "@repo/ui/components/input-group";

import { PickerOptionsSkeleton } from "@/components/procurement/procurement-skeletons";
import {
  itemMaterialOptionsQuery,
  type ItemMaterialOption,
} from "@/src/queries/contracts-items";

/** One row of a picker: a name and an optional detail under it. */
export type PickerOption = {
  id: string;
  label: string;
  detail?: string | null;
};

/** Typing waits this long before the Material search asks the server. */
const SEARCH_DELAY_MS = 250;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

type PickerProps<T extends PickerOption> = {
  id: string;
  /** The accessible name, e.g. "Line 2 Labour Category". */
  label: string;
  /** What the options are, plural: "Materials". */
  noun: string;
  placeholder: string;
  options: readonly T[];
  value: T | null;
  onChange: (option: T | null) => void;
  /** Typing, for a picker whose options come from the server. */
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** The input, for react-hook-form to focus. */
  inputRef?: Ref<HTMLInputElement>;
};

/**
 * A searchable pick of one master row for a rate analysis line (CM-1102):
 * typing narrows the options by name or detail; the kit's Combobox, with
 * named clear and show buttons.
 */
export function ResourcePicker<T extends PickerOption>({
  id,
  label,
  noun,
  placeholder,
  options,
  value,
  onChange,
  onQueryChange,
  loading = false,
  invalid = false,
  describedBy,
  inputRef,
}: PickerProps<T>) {
  const [query, setQuery] = useState("");
  const typed = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      options.filter(
        (option) =>
          typed === "" ||
          option.label.toLowerCase().includes(typed) ||
          (option.detail?.toLowerCase().includes(typed) ?? false),
      ),
    [options, typed],
  );
  const status = loading
    ? null
    : shown.length > 0
      ? null
      : typed !== ""
        ? `No ${noun} match “${query.trim()}”`
        : `No ${noun} yet.`;

  return (
    <Combobox<T>
      items={shown}
      filter={null}
      value={value}
      itemToStringLabel={(option: T) => option.label}
      isItemEqualToValue={(a: T, b: T) => a.id === b.id}
      onOpenChange={(open) => {
        if (!open) {
          setQuery("");
          onQueryChange?.("");
        }
      }}
      onInputValueChange={(text, details) => {
        if (details.reason !== "input-change") return;
        setQuery(text);
        onQueryChange?.(text.trim());
      }}
      onValueChange={(next: T | null) => {
        onChange(next);
      }}
    >
      <ComboboxInput
        ref={inputRef}
        id={id}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        autoComplete="off"
        showTrigger={false}
        className="w-full min-w-0"
      >
        <InputGroupAddon align="inline-end">
          {value != null ? (
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              aria-label={`Clear ${label}`}
              onClick={() => {
                onChange(null);
              }}
            >
              <XIcon className="pointer-events-none" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              render={<ComboboxTrigger />}
              aria-label={`Show ${noun}`}
              className="data-pressed:bg-transparent"
            />
          )}
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        {loading ? <PickerOptionsSkeleton /> : null}
        {status == null ? null : (
          <p
            role="status"
            className="text-muted-foreground px-3 py-2 text-center text-sm"
          >
            {status}
          </p>
        )}
        <ComboboxList aria-label={noun}>
          {(option: T) => (
            <ComboboxItem key={option.id} value={option} className="py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="break-words">{option.label}</span>
                {option.detail == null || option.detail === "" ? null : (
                  <span className="text-muted-foreground text-xs break-words">
                    {option.detail}
                  </span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** A Material in the picker, with what a pick fills in. */
export type MaterialPick = PickerOption & {
  uomId: string;
  /** Paise per unit; null without Materials Financial. */
  unitRate: number | null;
};

function toPick(option: ItemMaterialOption): MaterialPick {
  return {
    id: option.id,
    label: option.name,
    detail: [option.specification, option.uomName]
      .filter((part): part is string => part != null && part !== "")
      .join(" · "),
    uomId: option.uomId,
    unitRate: option.unitRate,
  };
}

/**
 * The Material of a material line: enabled Materials searched by name on
 * the server. A pick brings the Material's UoM and, with Materials
 * Financial, its unit rate as the line's suggested rate.
 */
export function MaterialLinePicker({
  id,
  label,
  value,
  onChange,
  invalid,
  inputRef,
}: {
  id: string;
  label: string;
  value: { id: string; name: string } | null;
  onChange: (material: MaterialPick | null) => void;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState("");
  const search = useDebounced(query, SEARCH_DELAY_MS);
  const results = useQuery({
    ...itemMaterialOptionsQuery(search),
    placeholderData: keepPreviousData,
  });
  const options = useMemo(
    () => (results.data ?? []).map(toPick),
    [results.data],
  );
  const selected = useMemo<MaterialPick | null>(
    () =>
      value == null
        ? null
        : (options.find((option) => option.id === value.id) ?? {
            id: value.id,
            label: value.name,
            uomId: "",
            unitRate: null,
          }),
    [value, options],
  );
  return (
    <ResourcePicker<MaterialPick>
      id={id}
      label={label}
      noun="Materials"
      placeholder="Search Materials"
      options={options}
      value={selected}
      onChange={onChange}
      onQueryChange={setQuery}
      loading={results.isPending}
      invalid={invalid}
      inputRef={inputRef}
    />
  );
}
