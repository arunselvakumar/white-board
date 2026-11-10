"use client";

import { useMemo, useState } from "react";
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

type Option = { id: string; name: string; create?: string };

/**
 * Pick any number of named things as chips (Assign To, Tags on the task
 * form). With `onCreate`, a name that matches nothing offers "Create …";
 * the created item is chosen at once.
 */
export function ChipsSelect({
  id,
  label,
  options,
  value,
  onChange,
  onCreate,
  placeholder,
  emptyText,
  disabled = false,
  invalid = false,
}: {
  id: string;
  /** The list's accessible name ("Team Members", "Tags"). */
  label: string;
  options: readonly { id: string; name: string }[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  onCreate?: (name: string) => Promise<{ id: string; name: string } | null>;
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const [extra, setExtra] = useState<Option[]>([]);
  const all = useMemo(() => {
    const known = new Map<string, Option>();
    for (const item of [...options, ...extra]) known.set(item.id, item);
    return [...known.values()];
  }, [options, extra]);
  const trimmed = query.trim().replace(/\s+/g, " ");
  const exists = all.some(
    (item) => item.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const items: Option[] =
    onCreate != null && trimmed !== "" && !exists
      ? [
          ...all,
          {
            id: `create:${trimmed}`,
            name: `Create “${trimmed}”`,
            create: trimmed,
          },
        ]
      : all;
  const selected = all.filter((item) => value.includes(item.id));

  return (
    <Combobox
      items={items}
      multiple
      value={selected}
      disabled={disabled}
      inputValue={query}
      onInputValueChange={(next: string) => {
        setQuery(next);
      }}
      itemToStringLabel={(item: Option) => item.name}
      isItemEqualToValue={(item: Option, other: Option) => item.id === other.id}
      onValueChange={(next: Option[]) => {
        const creating = next.find((item) => item.create != null);
        const ids = next
          .filter((item) => item.create == null)
          .map((item) => item.id);
        onChange(ids);
        if (creating?.create != null && onCreate != null) {
          void onCreate(creating.create).then((made) => {
            if (made == null) return;
            setExtra((current) => [...current, made]);
            onChange([...ids, made.id]);
            setQuery("");
          });
        }
      }}
    >
      <ComboboxChips ref={anchor} className="min-h-9 w-full">
        <ComboboxValue>
          {(chosen: Option[]) => (
            <>
              {chosen.map((item) => (
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
                aria-invalid={invalid}
                placeholder={chosen.length > 0 ? "" : placeholder}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList aria-label={label}>
          {(item: Option) => (
            <ComboboxItem key={item.id} value={item}>
              {item.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
