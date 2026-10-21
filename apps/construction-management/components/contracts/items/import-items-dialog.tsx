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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { QueryHttpError } from "@/src/queries/http";
import {
  ITEM_SAMPLE_URL,
  useImportItems,
  type ItemImportResult,
  type ItemImportRowError,
} from "@/src/queries/contracts-items";

const MAX_BYTES = 5 * 1024 * 1024;

function rowErrors(error: unknown): ItemImportRowError[] | null {
  if (!(error instanceof QueryHttpError) || error.code !== "IMPORT_HAS_ERRORS")
    return null;
  const details = error.details as
    { errors?: ItemImportRowError[] } | undefined;
  return details?.errors ?? [];
}

function resultText(result: ItemImportResult): string {
  const parts = [
    `${String(result.created)} added`,
    `${String(result.updated)} updated`,
  ];
  if (result.unchanged > 0) parts.push(`${String(result.unchanged)} unchanged`);
  return `${parts.join(", ")}.`;
}

/**
 * Item import (CM-1102, ADR CM-0023 §3): download the sample, fill in the
 * Company's own schedule, upload it. Rows are matched by Code: a new code
 * adds an Item, an existing one has its fields replaced (never its rate
 * analysis). All rows or none; every problem is listed by row and column.
 */
export function ImportItemsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useImportItems();
  const [error, setError] = useState<string | undefined>();
  const [errors, setErrors] = useState<ItemImportRowError[] | null>(null);
  const [result, setResult] = useState<ItemImportResult | null>(null);

  const reset = () => {
    setError(undefined);
    setErrors(null);
    setResult(null);
  };

  const choose = (file: File | undefined) => {
    if (file == null) return;
    reset();
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose the Excel (.xlsx) sample sheet.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("The file must be at most 5 MB.");
      return;
    }
    upload.mutate(file, {
      onSuccess: setResult,
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
          <DialogTitle>Import Items</DialogTitle>
          <DialogDescription>
            Fill in the sample, one Item per row: Code, Short description,
            Description, UoM, SAC/HSN, Schedule and Rate (₹). A new code adds an
            Item; a code already in the library updates it, and its rate
            analysis stays. Rows are saved all or none, up to 2,000.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <a
            href={ITEM_SAMPLE_URL}
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
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table aria-label="Problems in the sheet">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Row</TableHead>
                  <TableHead className="w-36">Column</TableHead>
                  <TableHead>Problem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((row) => (
                  <TableRow
                    key={`${String(row.row)}-${row.column}-${row.message}`}
                  >
                    <TableCell className="tabular-nums">{row.row}</TableCell>
                    <TableCell className="font-medium">{row.column}</TableCell>
                    <TableCell className="whitespace-normal">
                      {row.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {result != null ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {resultText(result)}
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
            {result != null ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
