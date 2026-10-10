"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

import {
  materialOptionsQuery,
  type MaterialOption,
} from "@/src/queries/material-options";

import { CreateMaterialDialog } from "./material-picker-create-dialog";

/**
 * Picks one Material for a procurement line (M5). Contract shared by every
 * procurement form: keep these props.
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

/** Typing waits this long before it asks the server. */
export const MATERIAL_SEARCH_DELAY_MS = 250;
/** The options read's page; more matches need a narrower search. */
const PAGE = 50;

/** The list's Create New row; never a value. */
type CreateRow = { kind: "create"; id: "create-new"; name: string };
type Row = MaterialOption | CreateRow;

function isCreate(row: Row): row is CreateRow {
  return "kind" in row;
}

/** "UltraTech, 50 kg bag · Bag · Civil Work Materials" */
export function materialDetail(option: MaterialOption): string {
  return [option.specification, option.uomName, option.categoryName]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

function matches(option: MaterialOption, text: string): boolean {
  const needle = text.toLowerCase();
  return (
    option.name.toLowerCase().includes(needle) ||
    (option.specification?.toLowerCase().includes(needle) ?? false)
  );
}

/** A value whose row is not loaded (yet): shows a name, never sent anywhere. */
function stub(id: string, name: string): MaterialOption {
  return {
    id,
    name,
    specification: null,
    uomId: "",
    uomName: "",
    categoryId: null,
    categoryName: null,
    unitRate: null,
    discount: null,
    gstRate: null,
    hsnCode: null,
    minStockQty: null,
  };
}

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

/**
 * A searchable Material combobox (CM-501). Typing searches the server by
 * name or specification (the first 50 matches); the chosen Material always
 * shows by name, loaded by id when it is not on the page. With
 * `allowCreate`, "Create New" adds a Material to the master and picks it.
 */
export function MaterialPicker({
  value,
  onChange,
  categoryId = null,
  excludeIds,
  allowCreate = false,
  id,
  "aria-label": ariaLabel = "Material",
  invalid = false,
  disabled = false,
}: MaterialPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  /** Rows this picker handed out, so a pick needs no second read. */
  const [known, setKnown] = useState<Record<string, MaterialOption>>({});
  const typed = query.trim();
  const search = useDebounced(typed, MATERIAL_SEARCH_DELAY_MS);

  const results = useQuery({
    ...materialOptionsQuery({ search, categoryId }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const remembered = value == null ? undefined : known[value];
  const current = useQuery({
    ...materialOptionsQuery({ ids: value == null ? [] : [value] }),
    enabled: value != null && remembered == null,
  });
  const loaded = current.data?.find((option) => option.id === value);
  const loading = current.isPending;
  const selected = useMemo(() => {
    if (value == null) return null;
    return (
      loaded ??
      remembered ??
      stub(value, loading ? "Loading…" : "Material not available")
    );
  }, [value, loaded, remembered, loading]);

  const options = useMemo(() => {
    const exclude = new Set(excludeIds ?? []);
    return (results.data ?? []).filter(
      (option) =>
        (option.id === value || !exclude.has(option.id)) &&
        // The server page may lag the typing; narrow it meanwhile.
        (typed === "" || matches(option, typed)),
    );
  }, [results.data, excludeIds, value, typed]);
  const rows = useMemo<Row[]>(
    () =>
      allowCreate
        ? [...options, { kind: "create", id: "create-new", name: typed }]
        : options,
    [options, allowCreate, typed],
  );

  const status = results.isError
    ? "Materials could not be loaded. Close and try again."
    : results.isPending
      ? "Loading materials…"
      : options.length > 0
        ? null
        : typed !== ""
          ? `No material matches “${typed}”`
          : categoryId == null
            ? "No materials yet"
            : "No materials in this category";
  const more =
    status == null && (results.data?.length ?? 0) >= PAGE
      ? `Showing the first ${String(PAGE)}. Type to find others.`
      : null;

  const pick = (option: MaterialOption) => {
    setKnown((rows) => ({ ...rows, [option.id]: option }));
    onChange(option);
  };

  return (
    <>
      <Combobox<Row>
        items={rows}
        filter={null}
        value={selected}
        disabled={disabled}
        itemToStringLabel={(row: Row) => (isCreate(row) ? query : row.name)}
        isItemEqualToValue={(row: Row, other: Row) => row.id === other.id}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        onInputValueChange={(text, details) => {
          if (details.reason === "input-change") setQuery(text);
        }}
        onValueChange={(next: Row | null) => {
          if (next == null) onChange(null);
          else if (isCreate(next)) setCreating(typed);
          else pick(next);
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          placeholder="Search materials"
          autoComplete="off"
          showTrigger={false}
          className="h-10 w-full min-w-0"
        >
          {/* The kit's own trigger and clear have no names; these do. */}
          <InputGroupAddon align="inline-end">
            {value != null && !disabled ? (
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                aria-label="Clear material"
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
                aria-label="Show materials"
                disabled={disabled}
                className="data-pressed:bg-transparent"
              />
            )}
          </InputGroupAddon>
        </ComboboxInput>
        <ComboboxContent>
          {status == null ? null : (
            <p
              role="status"
              className="text-muted-foreground px-3 py-2 text-center text-sm"
            >
              {status}
            </p>
          )}
          <ComboboxList aria-label="Materials">
            {(row: Row) =>
              isCreate(row) ? (
                <ComboboxItem key={row.id} value={row} className="py-2">
                  <PlusIcon aria-hidden className="text-muted-foreground" />
                  <span className="min-w-0 break-words">
                    {row.name === ""
                      ? "Create new material"
                      : `Create “${row.name}”`}
                  </span>
                </ComboboxItem>
              ) : (
                <ComboboxItem key={row.id} value={row} className="py-1.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words">{row.name}</span>
                    {materialDetail(row) === "" ? null : (
                      <span className="text-muted-foreground text-xs break-words">
                        {materialDetail(row)}
                      </span>
                    )}
                  </span>
                </ComboboxItem>
              )
            }
          </ComboboxList>
          {more == null ? null : (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">
              {more}
            </p>
          )}
        </ComboboxContent>
      </Combobox>
      {creating == null ? null : (
        <CreateMaterialDialog
          name={creating}
          onClose={() => {
            setCreating(null);
          }}
          onCreated={(option) => {
            setCreating(null);
            pick(option);
          }}
        />
      )}
    </>
  );
}
