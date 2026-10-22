"use client";

import { useId, useMemo, useState } from "react";
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
import { cn } from "@repo/ui/lib/utils";

import type { WorkOrderBoqItem } from "@/src/queries/contracts-work-orders";

import { money, quantity } from "./work-order-format";

/**
 * "Add from BOQ" (CM-1104): the Project's BOQ items with what each has
 * left after the other Work Orders; tick several and add them at once.
 * An item this Work Order already has can be added again.
 */
export function BoqItemsDialog({
  items,
  onWorkOrder,
  financial,
  onAdd,
  onClose,
}: {
  items: readonly WorkOrderBoqItem[];
  /** BOQ item ids already on this Work Order. */
  onWorkOrder: ReadonlySet<string>;
  financial: boolean;
  onAdd: (items: WorkOrderBoqItem[]) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const typed = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      items.filter(
        (item) =>
          typed === "" ||
          item.itemNo.toLowerCase().includes(typed) ||
          item.description.toLowerCase().includes(typed) ||
          item.sectionTitle.toLowerCase().includes(typed),
      ),
    [items, typed],
  );
  const toggle = (itemId: string, on: boolean) => {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from BOQ</DialogTitle>
          <DialogDescription>
            Each item comes in at what the BOQ has left after the other Work
            Orders, at its BOQ rate. Change either on the line.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-search`}>Search the BOQ</Label>
          <Input
            id={`${id}-search`}
            type="search"
            placeholder="Item no, description or section"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            This Project&apos;s BOQ has no items yet. Add them on the BOQ page,
            or add non-BOQ lines.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No BOQ items match “{search.trim()}”.
          </p>
        ) : (
          <ul
            aria-label="BOQ items"
            className="max-h-[50vh] min-w-0 space-y-1 overflow-y-auto pr-1"
          >
            {shown.map((item) => {
              const checkboxId = `${id}-${item.id}`;
              const left = BigInt(item.remaining.replace(".", ""));
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex min-w-0 items-start gap-3 rounded-lg border p-2.5",
                    picked.has(item.id) && "border-primary bg-primary/5",
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    className="mt-0.5"
                    checked={picked.has(item.id)}
                    onCheckedChange={(checked) => {
                      toggle(item.id, checked);
                    }}
                  />
                  <Label
                    htmlFor={checkboxId}
                    className="block min-w-0 flex-1 cursor-pointer font-normal"
                  >
                    <span className="block font-medium break-words">
                      {item.itemNo} · {item.description}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {item.sectionTitle} · BOQ {quantity(item.quantity)}{" "}
                      {item.uomName}
                      {financial ? ` at ${money(item.rate)}` : ""}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        left <= 0n
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {left <= 0n
                        ? "Nothing left after other Work Orders"
                        : `${quantity(item.remaining)} ${item.uomName} left`}
                      {onWorkOrder.has(item.id) ? " · On this Work Order" : ""}
                    </span>
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={picked.size === 0}
            onClick={() => {
              onAdd(items.filter((item) => picked.has(item.id)));
            }}
          >
            {picked.size === 0
              ? "Add items"
              : `Add ${String(picked.size)} ${picked.size === 1 ? "item" : "items"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
