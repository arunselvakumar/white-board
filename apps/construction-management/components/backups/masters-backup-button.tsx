"use client";

import { DatabaseBackup } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";

import { MastersBackupDialog } from "./backup-dialog";

/** Masters → Backup (CM-906): the master records the member may view. */
export function MastersBackupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <DatabaseBackup aria-hidden="true" />
        Backup
      </Button>
      {open && (
        <MastersBackupDialog
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
