"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { materialDetail } from "@/components/procurement/material-picker";
import {
  materialOptionsQuery,
  type MaterialOption,
} from "@/src/queries/material-options";

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
 * Bulk Select Materials (CM-0016 §5): the Work Type's assigned Materials
 * first, then any other Material by search. Materials already on the
 * sheet are left out. Adds one line per ticked Material.
 */
export function BulkSelectDialog({
  open,
  onOpenChange,
  workTypeName,
  workTypeMaterialIds,
  excludeIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workTypeName: string | null;
  workTypeMaterialIds: readonly string[];
  excludeIds: readonly string[];
  onAdd: (materials: MaterialOption[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [ticked, setTicked] = useState<ReadonlyMap<string, MaterialOption>>(
    new Map(),
  );
  const term = useDebounced(search.trim(), 250);
  const assigned = useQuery({
    ...materialOptionsQuery({ ids: workTypeMaterialIds }),
    enabled: open && workTypeMaterialIds.length > 0,
  });
  const others = useQuery({
    ...materialOptionsQuery({ search: term }),
    enabled: open,
  });
  const excluded = new Set(excludeIds);
  const assignedIds = new Set(workTypeMaterialIds);
  const matches = (option: MaterialOption) =>
    term === "" || option.name.toLowerCase().includes(term.toLowerCase());
  const first = (workTypeMaterialIds.length === 0 ? [] : (assigned.data ?? []))
    .filter((option) => !excluded.has(option.id) && matches(option))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rest = (others.data ?? []).filter(
    (option) => !excluded.has(option.id) && !assignedIds.has(option.id),
  );

  const close = () => {
    setSearch("");
    setTicked(new Map());
    onOpenChange(false);
  };

  const group = (label: string, options: MaterialOption[], empty: string) => (
    <section aria-label={label} className="space-y-1">
      <h4 className="text-muted-foreground text-xs font-medium">{label}</h4>
      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {options.map((option) => {
            const id = `bulk-material-${option.id}`;
            return (
              <li key={option.id} className="flex items-start gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={ticked.has(option.id)}
                  onCheckedChange={(on) => {
                    setTicked((current) => {
                      const next = new Map(current);
                      if (on) next.set(option.id, option);
                      else next.delete(option.id);
                      return next;
                    });
                  }}
                />
                <Label
                  htmlFor={id}
                  className="min-w-0 flex-col items-start gap-0 font-normal"
                >
                  <span>{option.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {materialDetail(option)}
                  </span>
                </Label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Bulk Select Materials</DialogTitle>
          <DialogDescription>
            Tick the materials the crew used; each becomes a line to fill in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-material-search">Search materials</Label>
          <Input
            id="bulk-material-search"
            autoComplete="off"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {workTypeMaterialIds.length > 0 &&
            group(
              workTypeName == null
                ? "Work Type materials"
                : `Assigned to ${workTypeName}`,
              first,
              "None left to add.",
            )}
          {group(
            workTypeMaterialIds.length > 0 ? "Other materials" : "Materials",
            rest,
            others.isPending ? "Loading…" : "No materials match.",
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={ticked.size === 0}
            onClick={() => {
              onAdd([...ticked.values()]);
              close();
            }}
          >
            {ticked.size === 0
              ? "Add materials"
              : `Add ${String(ticked.size)} ${ticked.size === 1 ? "material" : "materials"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
