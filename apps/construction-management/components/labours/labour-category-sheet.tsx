"use client";

import { Button } from "@repo/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";

import {
  LookupNameFields,
  useLookupNameForm,
} from "@/components/masters/lookup-name-form";
import { LABOUR_CATEGORIES_SCREEN } from "@/components/masters/lookup-screens";
import type { LookupItem } from "@/src/queries/masters";

function AddCategoryForm({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (category: LookupItem) => void;
}) {
  const lookup = useLookupNameForm({
    config: LABOUR_CATEGORIES_SCREEN,
    item: null,
    onSaved: (saved) => {
      if (saved != null) onAdded(saved);
      onClose();
    },
  });
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        // The sheet is portalled, but React still bubbles submit to the
        // Labour form around the trigger.
        event.stopPropagation();
        void lookup.submit(event);
      }}
    >
      <SheetHeader>
        <SheetTitle>Add Labour Category</SheetTitle>
        <SheetDescription>
          {LABOUR_CATEGORIES_SCREEN.dialogDescription} It is added to Masters
          and chosen for this Labour.
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
        <LookupNameFields lookup={lookup} idPrefix="sheet-" />
      </div>
      <SheetFooter className="flex-row justify-end border-t">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={lookup.saving}>
          {lookup.saving ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </form>
  );
}

/**
 * Add Labour Category without leaving the Labour form: a slide-over from
 * the right. Saving adds it to Masters, refreshes the Labour Category
 * choices and hands the new row back to be chosen.
 */
export function LabourCategorySheet({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (category: LookupItem) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        {open ? (
          <AddCategoryForm
            onClose={() => {
              onOpenChange(false);
            }}
            onAdded={onAdded}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
