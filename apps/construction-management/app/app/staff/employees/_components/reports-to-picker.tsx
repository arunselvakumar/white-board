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

import { employeesQuery } from "@/src/queries/employees";

/** Typing waits this long before it asks the server. */
const SEARCH_DELAY_MS = 250;
/** The Employees list page; more matches need a narrower search. */
const PAGE = 25;

export type EmployeeRef = {
  id: string;
  name: string;
  employeeCode?: string | null;
  roleName?: string;
};

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
 * Reports To (ADR CM-0035, CM-0055 §1): a searchable combobox of the
 * Company's active Employees, by name, Employee Id or mobile. The Employee
 * being edited is left out. The chosen Employee always shows by name, from
 * the saved one or the row picked.
 */
export function ReportsToPicker({
  id,
  value,
  onChange,
  saved,
  excludeId,
  invalid = false,
  "aria-describedby": describedBy,
}: {
  id: string;
  /** The chosen Employee's id, or "" for none. */
  value: string;
  onChange: (id: string) => void;
  /** The Employee saved on the record, so it shows before any search. */
  saved: EmployeeRef | null;
  /** The Employee being edited: they cannot report to themselves. */
  excludeId?: string;
  invalid?: boolean;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<EmployeeRef | null>(null);
  const typed = query.trim();
  const search = useDebounced(typed, SEARCH_DELAY_MS);

  const results = useQuery({
    ...employeesQuery({
      search,
      status: "active",
      projectId: null,
      categoryId: null,
      roleId: null,
      departmentId: null,
      cursor: null,
    }),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const options = useMemo<EmployeeRef[]>(
    () =>
      (results.data?.items ?? [])
        .filter((employee) => employee.id !== excludeId)
        .map(({ id: employeeId, name, employeeCode, role }) => ({
          id: employeeId,
          name,
          employeeCode,
          roleName: role.name,
        })),
    [results.data, excludeId],
  );
  const selected = useMemo<EmployeeRef | null>(() => {
    if (value === "") return null;
    if (picked?.id === value) return picked;
    if (saved?.id === value) return saved;
    return (
      options.find((option) => option.id === value) ?? {
        id: value,
        name: "Employee not available",
      }
    );
  }, [value, picked, saved, options]);

  const status = results.isError
    ? "Employees could not be loaded. Close and try again."
    : results.isPending
      ? "Loading Employees…"
      : options.length > 0
        ? null
        : typed !== ""
          ? `No active Employee matches “${typed}”`
          : "No other active Employees yet";
  const more =
    status == null && (results.data?.total ?? 0) > PAGE
      ? `Showing the first ${String(PAGE)}. Type to find others.`
      : null;

  return (
    <Combobox<EmployeeRef>
      items={options}
      filter={null}
      value={selected}
      itemToStringLabel={(row: EmployeeRef) => row.name}
      isItemEqualToValue={(row: EmployeeRef, other: EmployeeRef) =>
        row.id === other.id
      }
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      onInputValueChange={(text, details) => {
        if (details.reason === "input-change") setQuery(text);
      }}
      onValueChange={(next: EmployeeRef | null) => {
        setPicked(next);
        onChange(next?.id ?? "");
      }}
    >
      <ComboboxInput
        id={id}
        aria-label="Reports To"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder="Search Employees"
        autoComplete="off"
        showTrigger={false}
        className="h-10 w-full min-w-0"
      >
        {/* The kit's own trigger and clear have no names; these do. */}
        <InputGroupAddon align="inline-end">
          {value !== "" ? (
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              aria-label="Clear Reports To"
              onClick={() => {
                setPicked(null);
                onChange("");
              }}
            >
              <XIcon className="pointer-events-none" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              render={<ComboboxTrigger />}
              aria-label="Show Employees"
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
        <ComboboxList aria-label="Employees">
          {(row: EmployeeRef) => (
            <ComboboxItem key={row.id} value={row} className="py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="break-words">{row.name}</span>
                {row.employeeCode == null && row.roleName == null ? null : (
                  <span className="text-muted-foreground text-xs">
                    {[row.roleName, row.employeeCode]
                      .filter((part) => part != null)
                      .join(" · ")}
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
