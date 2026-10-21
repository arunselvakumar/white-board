"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
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

import { PickerOptionsSkeleton } from "@/components/procurement/procurement-skeletons";
import {
  clientOptionsQuery,
  type ClientOption,
} from "@/src/queries/masters-clients";
import { gstStateName } from "@/src/shared-kernel/gst-states";

/** Typing waits this long before it asks the server. */
const SEARCH_DELAY_MS = 250;
/** The options read's page; more matches need a narrower search. */
const PAGE = 50;

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

/** "33AAPFA0939F1ZM" or "Karnataka", under the name. */
function clientDetail(option: ClientOption): string {
  if (option.gstin != null) return option.gstin;
  return option.stateCode == null ? "" : (gstStateName(option.stateCode) ?? "");
}

/** A value whose row is not loaded (yet): shows a name, never sent anywhere. */
function stub(id: string, name: string): ClientOption {
  return { id, name, gstin: null, stateCode: null, isActive: true };
}

/**
 * Picks the Project's Client from Master records → Clients (ADR CM-0023
 * §2). Typing searches active Clients by name or GSTIN on the server; the
 * linked Client always shows by name, loaded by id when it is not on the
 * page (an inactive one included).
 */
export function ProjectClientPicker({
  value,
  onChange,
  id,
  invalid = false,
  disabled = false,
  "aria-describedby": describedBy,
}: {
  value: string | null;
  onChange: (client: ClientOption | null) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** Rows this picker handed out, so a pick needs no second read. */
  const [known, setKnown] = useState<Record<string, ClientOption>>({});
  const typed = query.trim();
  const search = useDebounced(typed, SEARCH_DELAY_MS);

  const results = useQuery({
    ...clientOptionsQuery({ search }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const remembered = value == null ? undefined : known[value];
  const current = useQuery({
    ...clientOptionsQuery({ ids: value == null ? [] : [value] }),
    enabled: value != null && remembered == null,
  });
  const loaded = current.data?.find((option) => option.id === value);
  const loading = current.isPending;
  const selected = useMemo(() => {
    if (value == null) return null;
    return (
      remembered ??
      loaded ??
      stub(value, loading ? "Loading…" : "Client not available")
    );
  }, [value, loaded, remembered, loading]);

  const options = useMemo(() => {
    const needle = typed.toLowerCase();
    return (results.data ?? []).filter(
      (option) =>
        // The server page may lag the typing; narrow it meanwhile.
        needle === "" ||
        option.name.toLowerCase().includes(needle) ||
        (option.gstin?.toLowerCase().includes(needle) ?? false),
    );
  }, [results.data, typed]);

  const status = results.isError
    ? "Clients could not be loaded. Close and try again."
    : results.isPending
      ? null
      : options.length > 0
        ? null
        : typed !== ""
          ? `No Client matches “${typed}”`
          : "No Clients yet. Add them in Master records → Clients.";
  const more =
    status == null && (results.data?.length ?? 0) >= PAGE
      ? `Showing the first ${String(PAGE)}. Type to find others.`
      : null;

  return (
    <Combobox<ClientOption>
      items={options}
      filter={null}
      value={selected}
      disabled={disabled}
      itemToStringLabel={(option: ClientOption) => option.name}
      isItemEqualToValue={(a: ClientOption, b: ClientOption) => a.id === b.id}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      onInputValueChange={(text, details) => {
        if (details.reason === "input-change") setQuery(text);
      }}
      onValueChange={(next: ClientOption | null) => {
        if (next != null) setKnown((rows) => ({ ...rows, [next.id]: next }));
        onChange(next);
      }}
    >
      <ComboboxInput
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        placeholder="Search Clients"
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
              aria-label="Clear Client"
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
              aria-label="Show Clients"
              disabled={disabled}
              className="data-pressed:bg-transparent"
            />
          )}
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        {results.isPending ? <PickerOptionsSkeleton /> : null}
        {status == null ? null : (
          <p
            role="status"
            className="text-muted-foreground px-3 py-2 text-center text-sm"
          >
            {status}
          </p>
        )}
        <ComboboxList aria-label="Clients">
          {(option: ClientOption) => (
            <ComboboxItem key={option.id} value={option} className="py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="break-words">{option.name}</span>
                {clientDetail(option) === "" ? null : (
                  <span className="text-muted-foreground text-xs break-words">
                    {clientDetail(option)}
                  </span>
                )}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        {more == null ? null : (
          <p className="text-muted-foreground border-t px-3 py-2 text-xs">
            {more}
          </p>
        )}
      </ComboboxContent>
    </Combobox>
  );
}
