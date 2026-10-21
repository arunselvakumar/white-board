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
  boqSampleUrl,
  useImportBoq,
  type BoqImportResult,
  type BoqImportRowError,
} from "@/src/queries/contracts-boq";

const MAX_BYTES = 5 * 1024 * 1024;

function rowErrors(error: unknown): BoqImportRowError[] | null {
  if (!(error instanceof QueryHttpError) || error.code !== "IMPORT_HAS_ERRORS")
    return null;
  const details = error.details as { errors?: BoqImportRowError[] } | undefined;
  return details?.errors ?? [];
}

function resultText(result: BoqImportResult): string {
  const parts = [
    `${String(result.created)} ${result.created === 1 ? "item" : "items"} added`,
    `${String(result.updated)} updated`,
  ];
  if (result.sectionsCreated > 0)
    parts.unshift(
      `${String(result.sectionsCreated)} ${result.sectionsCreated === 1 ? "section" : "sections"} added`,
    );
  if (result.unchanged > 0) parts.push(`${String(result.unchanged)} unchanged`);
  return `${parts.join(", ")}.`;
}

/**
 * BOQ import (CM-1103, ADR CM-0023 §4): download the sample, fill in the
 * contract's sections and items, upload it. Rows are matched by Item no:
 * a new number adds an item, an existing one is updated, but a measured
 * item's quantity and rate change only by Variation. All rows or none;
 * every problem is listed by row and column.
 */
export function ImportBoqDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useImportBoq(projectId);
  const [error, setError] = useState<string | undefined>();
  const [errors, setErrors] = useState<BoqImportRowError[] | null>(null);
  const [result, setResult] = useState<BoqImportResult | null>(null);

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
          <DialogTitle>Import BOQ</DialogTitle>
          <DialogDescription>
            Fill in the sample, one item per row: Section, Item no, Description,
            UoM, SAC/HSN, Quantity, Rate (₹), Wing / Location and an optional
            Library code. A new item number adds an item; one the BOQ has
            updates it. Rows are saved all or none, up to 5,000.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-3">
          <a
            href={boqSampleUrl(projectId)}
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
