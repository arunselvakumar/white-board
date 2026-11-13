"use client";

import { XIcon } from "lucide-react";
import { useMemo } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@repo/ui/components/combobox";
import {
  InputGroupAddon,
  InputGroupButton,
} from "@repo/ui/components/input-group";

export type CompanyChoice = {
  id: string;
  name: string;
  city: string | null;
};

/**
 * A searchable pick of one Prospect Company from those the viewer can see
 * (form options). `""` is none; the clear button empties it.
 */
export function ProspectCompanyPicker({
  id,
  companies,
  value,
  onChange,
  placeholder = "Search Prospect Companies",
  invalid = false,
  required = false,
  disabled = false,
  className,
}: {
  id: string;
  companies: readonly CompanyChoice[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const selected = useMemo(
    () => companies.find((company) => company.id === value) ?? null,
    [companies, value],
  );
  return (
    <Combobox<CompanyChoice>
      items={companies}
      value={selected}
      disabled={disabled}
      itemToStringLabel={(company: CompanyChoice) => company.name}
      isItemEqualToValue={(company: CompanyChoice, other: CompanyChoice) =>
        company.id === other.id
      }
      onValueChange={(next: CompanyChoice | null) => {
        onChange(next?.id ?? "");
      }}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        showTrigger={false}
        disabled={disabled}
        className={className ?? "w-full min-w-0"}
      >
        {/* The kit's own trigger and clear have no names; these do. */}
        <InputGroupAddon align="inline-end">
          {value !== "" && !disabled ? (
            <InputGroupButton
              size="icon-xs"
              variant="ghost"
              aria-label="Clear Prospect Company"
              onClick={() => {
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
              aria-label="Show Prospect Companies"
              disabled={disabled}
              className="data-pressed:bg-transparent"
            />
          )}
        </InputGroupAddon>
      </ComboboxInput>
      <ComboboxContent>
        <ComboboxEmpty>No Prospect Company matches</ComboboxEmpty>
        <ComboboxList aria-label="Prospect Companies">
          {(company: CompanyChoice) => (
            <ComboboxItem key={company.id} value={company} className="py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="break-words">{company.name}</span>
                {company.city == null ? null : (
                  <span className="text-muted-foreground text-xs">
                    {company.city}
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
