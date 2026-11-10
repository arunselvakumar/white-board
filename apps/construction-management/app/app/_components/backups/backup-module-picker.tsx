"use client";

import { Badge } from "@repo/ui/components/badge";
import { Checkbox } from "@repo/ui/components/checkbox";

import type { BackupModuleOption } from "@/src/queries/backups";

function groupsOf(
  modules: readonly BackupModuleOption[],
): { group: string; modules: BackupModuleOption[] }[] {
  const groups: { group: string; modules: BackupModuleOption[] }[] = [];
  for (const option of modules) {
    const found = groups.find((entry) => entry.group === option.group);
    if (found == null) groups.push({ group: option.group, modules: [option] });
    else found.modules.push(option);
  }
  return groups;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/**
 * The modules a backup holds, grouped under their headings, with Select
 * all for everything and for each group (CM-906). A module whose files
 * would carry amounts says so.
 */
export function BackupModulePicker({
  modules,
  value,
  onChange,
  invalid = false,
}: {
  modules: readonly BackupModuleOption[];
  value: readonly string[];
  onChange: (keys: string[]) => void;
  invalid?: boolean;
}) {
  const chosen = new Set(value);
  const inOrder = (keys: Set<string>) =>
    modules.map((option) => option.key).filter((key) => keys.has(key));
  const setMany = (keys: readonly string[], on: boolean) => {
    const next = new Set(chosen);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(inOrder(next));
  };
  const all = modules.map((option) => option.key);
  const allChosen = all.length > 0 && all.every((key) => chosen.has(key));
  const someChosen = all.some((key) => chosen.has(key));

  return (
    <fieldset className="min-w-0 space-y-3" aria-invalid={invalid}>
      <legend className="sr-only">Modules</legend>
      <label
        htmlFor="backup-modules-all"
        className="flex cursor-pointer items-center gap-3 text-sm font-medium"
      >
        <Checkbox
          id="backup-modules-all"
          checked={allChosen}
          indeterminate={someChosen && !allChosen}
          onCheckedChange={(checked) => {
            setMany(all, checked);
          }}
        />
        Select all modules
      </label>
      <div className="max-h-[45vh] min-w-0 space-y-3 overflow-y-auto pr-1">
        {groupsOf(modules).map(({ group, modules: options }) => {
          const keys = options.map((option) => option.key);
          const groupAll = keys.every((key) => chosen.has(key));
          const groupSome = keys.some((key) => chosen.has(key));
          return (
            <section
              key={group}
              aria-label={group}
              className="bg-card min-w-0 rounded-xl border"
            >
              <label
                htmlFor={`backup-group-${slug(group)}`}
                className="flex cursor-pointer items-center gap-3 border-b px-4 py-2.5"
              >
                <Checkbox
                  id={`backup-group-${slug(group)}`}
                  checked={groupAll}
                  indeterminate={groupSome && !groupAll}
                  onCheckedChange={(checked) => {
                    setMany(keys, checked);
                  }}
                />
                <span className="text-muted-foreground text-sm font-semibold">
                  <span className="sr-only">Select all in </span>
                  {group}
                </span>
              </label>
              <ul className="divide-y">
                {options.map((option) => {
                  const id = `backup-module-${slug(option.key)}`;
                  return (
                    <li key={option.key}>
                      <label
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-3 px-4 py-2.5"
                      >
                        <Checkbox
                          id={id}
                          checked={chosen.has(option.key)}
                          onCheckedChange={(checked) => {
                            setMany([option.key], checked);
                          }}
                        />
                        <span className="min-w-0 flex-1 text-sm break-words">
                          {option.label}
                        </span>
                        {option.includesMoney ? (
                          <Badge variant="outline">Amounts</Badge>
                        ) : null}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </fieldset>
  );
}
