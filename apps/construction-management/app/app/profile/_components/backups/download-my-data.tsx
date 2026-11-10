"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { useRequestBackup, type Backup } from "@/src/queries/backups";

import { BackupProgress } from "./backup-progress";

/**
 * Download My Data (CM-906, ADR CM-0021 §8): a ZIP of the User's own data
 * across Companies, with a 7-day link for them only.
 */
export function DownloadMyDataDialog({ onClose }: { onClose: () => void }) {
  const request = useRequestBackup();
  const [requested, setRequested] = useState<Backup | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Download my data</DialogTitle>
          <DialogDescription>
            A ZIP of your profile, your Team Member record in each Company
            (Aadhaar and PAN masked), your signed-in devices, your notifications
            and the changes you made.
          </DialogDescription>
        </DialogHeader>
        {requested == null ? (
          <>
            <FormAlert
              message={
                request.error == null
                  ? undefined
                  : fieldForCode(request.error, {}).message
              }
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={request.isPending}
                onClick={() => {
                  request.mutate(
                    { scope: "my_data" },
                    { onSuccess: setRequested },
                  );
                }}
              >
                {request.isPending ? "Preparing…" : "Prepare my data"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <BackupProgress backupId={requested.id} initial={requested} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** My Profile → Privacy → Download My Data (a row like the other Privacy actions). */
export function DownloadMyDataAction() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Item variant="outline" role="listitem" className="bg-card flex-wrap">
        <ItemMedia variant="icon">
          <Download />
        </ItemMedia>
        <ItemContent className="min-w-0">
          <ItemTitle>Download my data</ItemTitle>
          <ItemDescription>
            A copy of your profile, Companies, devices, notifications and
            activity, as CSV and JSON.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(true);
            }}
          >
            Download my data…
          </Button>
        </ItemActions>
      </Item>
      {open && (
        <DownloadMyDataDialog
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
