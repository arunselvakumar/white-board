"use client";

import { CircleCheck, Download, FileSpreadsheet } from "lucide-react";
import { useRef, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { QueryHttpError } from "@/src/queries/http";
import {
  unitSampleUrl,
  useImportUnits,
  type UnitImportRowError,
} from "@/src/queries/sales-units";

const MAX_BYTES = 2 * 1024 * 1024;

function rowErrors(error: unknown): UnitImportRowError[] | null {
  if (!(error instanceof QueryHttpError) || error.code !== "IMPORT_HAS_ERRORS")
    return null;
  const details = error.details as
    { errors?: UnitImportRowError[] } | undefined;
  return details?.errors ?? [];
}

/**
 * Unit import (CM-1005, ADR CM-0022 §8): download the sample — every unit
 * of the Project with its current details — change it, upload it. Each
 * row updates its unit's Unit type, areas and Unavailable, matched by Wing
 * and Unit No; Wings and units are never created here. All or none.
 */
export function ImportUnitsDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useImportUnits(projectId);
  const [error, setError] = useState<string | undefined>();
  const [errors, setErrors] = useState<UnitImportRowError[] | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);

  const reset = () => {
    setError(undefined);
    setErrors(null);
    setUpdated(null);
  };

  const choose = (file: File | undefined) => {
    if (file == null) return;
    reset();
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose the Excel (.xlsx) sample sheet.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The file must be at most 2 MB.");
      return;
    }
    upload.mutate(file, {
      onSuccess: (result) => {
        setUpdated(result.updated);
      },
      onError: (failure) => {
        setErrors(rowErrors(failure));
        setError(fieldForCode(failure, {}).message);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import unit details</DialogTitle>
          <DialogDescription>
            The sample lists every unit of this Project with its Unit type,
            areas and whether it is unavailable. Change what you need and upload
            it: units are matched by Wing and Unit No, a blank cell clears it,
            and rows are saved all or none (up to 2,000). Add Wings and units in
            the Wing editor.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <a
            href={unitSampleUrl(projectId)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Download sample
          </a>
          <Input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Choose Excel file"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <FileSpreadsheet aria-hidden="true" />
            {upload.isPending ? "Importing…" : "Upload filled sheet"}
          </Button>
        </div>
        <FormAlert message={error} />
        {errors != null && errors.length > 0 ? (
          <ul
            aria-label="Problems in the sheet"
            className="bg-card max-h-72 divide-y overflow-y-auto rounded-lg border text-sm"
          >
            {errors.map((row) => (
              <li
                key={`${String(row.row)}-${row.field}-${row.message}`}
                className="flex gap-3 px-3 py-2"
              >
                <span className="text-muted-foreground w-14 shrink-0">
                  Row {row.row}
                </span>
                <span className="min-w-0 break-words">
                  <span className="font-medium">{row.field}</span>:{" "}
                  {row.message}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {updated != null ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {updated} {updated === 1 ? "unit" : "units"} updated.
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {updated != null ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
