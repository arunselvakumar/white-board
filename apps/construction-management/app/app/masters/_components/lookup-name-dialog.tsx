"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import type { LookupItem } from "@/src/queries/masters";

import {
  LookupNameFields,
  useLookupNameForm,
} from "@/app/app/_components/masters/lookup-name-form";
import type { LookupScreenConfig } from "@/app/app/_components/masters/lookup-screens";

/**
 * Add a row, or rename a Company-made one (with the `updatedAt` it loaded).
 * Labour Categories also set their skill; a Default one keeps its name and
 * changes only its skill.
 */
export function LookupNameDialog({
  config,
  item,
  onClose,
}: {
  config: LookupScreenConfig;
  /** Null to add. */
  item: LookupItem | null;
  onClose: () => void;
}) {
  const lookup = useLookupNameForm({ config, item, onSaved: onClose });
  const withSkill = config.withSkill === true;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void lookup.submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item == null
                ? `Add ${config.singular}`
                : `${withSkill ? "Edit" : "Rename"} ${item.name}`}
            </DialogTitle>
            <DialogDescription>{config.dialogDescription}</DialogDescription>
          </DialogHeader>
          <LookupNameFields lookup={lookup} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={lookup.saving}>
              {lookup.saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
