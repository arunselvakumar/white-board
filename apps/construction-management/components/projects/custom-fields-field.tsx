"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
  Controller,
  useWatch,
  type FieldArrayWithId,
  type UseFormReturn,
} from "react-hook-form";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@repo/ui/components/autocomplete";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";

import { FieldError } from "@/components/auth/field-error";
import { PROJECT_CUSTOM_FIELDS_MAX } from "@/src/projects/domain/project-contract-rules";
import { customFieldLabelsQuery } from "@/src/queries/projects";

import type { ProjectFormValues } from "./project-form-schema";

/** Suggestions for one row: used names that match, minus names on this form. */
function suggestionsFor(
  labels: readonly string[],
  typed: string,
  taken: ReadonlySet<string>,
): string[] {
  const query = typed.trim().toLowerCase();
  return labels
    .filter((label) => {
      const key = label.toLowerCase();
      if (taken.has(key)) return false;
      return query === "" || (key.includes(query) && key !== query);
    })
    .slice(0, 8);
}

function FieldNameInput({
  index,
  form,
  labels,
  taken,
  invalid,
}: {
  index: number;
  form: UseFormReturn<ProjectFormValues>;
  labels: readonly string[];
  taken: ReadonlySet<string>;
  invalid: boolean;
}) {
  return (
    <Controller
      name={`customFields.${index}.label`}
      control={form.control}
      render={({ field }) => {
        const items = suggestionsFor(labels, field.value, taken);
        return (
          <Autocomplete
            items={items}
            mode="none"
            filter={null}
            openOnInputClick
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
            }}
          >
            <AutocompleteInput
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              className="h-10"
              autoComplete="off"
              placeholder="Field name"
              aria-label={`Field name ${String(index + 1)}`}
              aria-invalid={invalid}
            />
            {items.length === 0 ? null : (
              <AutocompleteContent>
                <AutocompleteList aria-label="Field names used on other Projects">
                  {(item: string) => (
                    <AutocompleteItem key={item} value={item}>
                      {item}
                    </AutocompleteItem>
                  )}
                </AutocompleteList>
              </AutocompleteContent>
            )}
          </Autocomplete>
        );
      }}
    />
  );
}

/**
 * Additional details (CM-413): fields the Company names itself, text only,
 * at most 20. Names already used on other Projects are offered as the user
 * types, so "Site engineer" stays one spelling.
 */
export function CustomFieldsField({
  form,
  fields,
  onAdd,
  onRemove,
}: {
  form: UseFormReturn<ProjectFormValues>;
  fields: FieldArrayWithId<ProjectFormValues, "customFields">[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  // Optional read: no suggestions is fine, so this never suspends the form.
  const labels = useQuery(customFieldLabelsQuery).data?.items ?? [];
  const rows = useWatch({ control: form.control, name: "customFields" });
  const errors = form.formState.errors.customFields;
  const full = fields.length >= PROJECT_CUSTOM_FIELDS_MAX;

  const takenBy = useMemo(
    () =>
      rows.map(
        (_, index) =>
          new Set(
            rows
              .filter((_row, other) => other !== index)
              .map((row) => row.label.trim().toLowerCase())
              .filter((label) => label !== ""),
          ),
      ),
    [rows],
  );

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Add anything else you track, like Site engineer or Architect.
        </p>
      ) : (
        <div
          role="group"
          aria-label="Custom fields"
          className="space-y-3 sm:grid sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] sm:space-y-0 sm:gap-x-3"
        >
          <div
            aria-hidden="true"
            className="text-muted-foreground hidden pb-1.5 text-xs font-medium sm:col-span-3 sm:grid sm:grid-cols-subgrid"
          >
            <span>Field name</span>
            <span>Value</span>
            <span />
          </div>
          {fields.map((item, index) => {
            const labelError = errors?.[index]?.label?.message;
            const valueError = errors?.[index]?.value?.message;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:col-span-3 sm:grid-cols-subgrid sm:gap-y-1 sm:py-1"
              >
                <div className="col-start-1 row-start-1 min-w-0 sm:col-start-auto sm:row-start-auto">
                  <FieldNameInput
                    index={index}
                    form={form}
                    labels={labels}
                    taken={takenBy[index] ?? new Set()}
                    invalid={labelError != null}
                  />
                </div>
                <Input
                  className="col-span-2 col-start-1 row-start-2 h-10 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
                  autoComplete="off"
                  placeholder="Value"
                  aria-label={`Value ${String(index + 1)}`}
                  aria-invalid={valueError != null}
                  {...form.register(`customFields.${index}.value`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground col-start-2 row-start-1 size-10 sm:col-start-auto sm:row-start-auto"
                  aria-label={`Remove field ${String(index + 1)}`}
                  onClick={() => {
                    onRemove(index);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
                {labelError == null && valueError == null ? null : (
                  <div className="col-span-2 space-y-1 sm:col-span-3">
                    <FieldError message={labelError} />
                    <FieldError message={valueError} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <FieldError message={errors?.message ?? errors?.root?.message} />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-dashed"
          disabled={full}
          onClick={onAdd}
        >
          <Plus aria-hidden="true" />
          Add field
        </Button>
        {full ? (
          <p className="text-muted-foreground text-sm">
            A Project can have at most {PROJECT_CUSTOM_FIELDS_MAX} fields.
          </p>
        ) : null}
      </div>
    </div>
  );
}
