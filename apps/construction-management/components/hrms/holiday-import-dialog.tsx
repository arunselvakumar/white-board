"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
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
import {
  HRMS_HOLIDAYS_KEY,
  hrmsHolidaySampleUrl,
  importHrmsHolidays,
  type HrmsHolidayImportPreview,
} from "@/src/queries/hrms-holidays";

import { formatDate } from "./hrms-parts";

const MAX_BYTES = 2 * 1024 * 1024;

const plural = (count: number) => (count === 1 ? "holiday" : "holidays");

/**
 * Import Holidays (CM-305): download the sample, upload it filled in,
 * check every row, then add all rows at once. `.xlsx` only.
 */
export function HolidayImportDialog({
  year,
  onClose,
}: {
  /** The year of the sample's example rows. */
  year: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HrmsHolidayImportPreview | null>(null);
  const [error, setError] = useState<string | undefined>();
  const check = useMutation({
    mutationFn: (chosen: File) => importHrmsHolidays(chosen, true),
    onSuccess: setPreview,
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });
  const commit = useMutation({
    mutationFn: (chosen: File) => importHrmsHolidays(chosen, false),
    onSuccess: async (result) => {
      setPreview(result);
      if (result.imported > 0)
        await queryClient.invalidateQueries({ queryKey: HRMS_HOLIDAYS_KEY });
    },
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });

  const choose = (chosen: File | undefined) => {
    if (chosen == null) return;
    setFile(null);
    setPreview(null);
    setError(undefined);
    if (!chosen.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose the Excel (.xlsx) sample sheet.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError("The file must be at most 2 MB.");
      return;
    }
    setFile(chosen);
    check.mutate(chosen);
  };

  const imported = preview != null && preview.imported > 0;
  const busy = check.isPending || commit.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Holidays</DialogTitle>
          <DialogDescription>
            Fill in the sample sheet, one holiday per row, and upload it. Every
            row is checked first; nothing is added until every row is right.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={hrmsHolidaySampleUrl(year)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Download sample sheet
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
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <FileSpreadsheet aria-hidden="true" />
            {file == null ? "Upload filled sheet" : "Upload another sheet"}
          </Button>
          {file != null && (
            <span className="text-muted-foreground truncate text-sm">
              {file.name}
            </span>
          )}
        </div>

        {check.isPending && (
          <p role="status" className="text-muted-foreground text-sm">
            Checking rows…
          </p>
        )}
        {preview != null && (
          <div className="space-y-3">
            <p role="status" className="text-sm">
              {imported
                ? `Imported ${String(preview.imported)} ${plural(preview.imported)}.`
                : `${String(preview.valid)} ready · ${String(preview.invalid)} with errors`}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table aria-label="Import preview">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.row}>
                      <TableCell className="tabular-nums">{row.row}</TableCell>
                      <TableCell className="font-medium">
                        {row.values.name || "—"}
                        {row.values.isOptional ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · Optional
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row.values.date == null
                          ? "—"
                          : formatDate(row.values.date)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {row.ok ? (
                          <Badge variant="secondary">
                            <CircleCheck aria-hidden="true" />
                            Ready
                          </Badge>
                        ) : (
                          <ul className="text-destructive space-y-0.5 text-xs">
                            {row.errors.map((rowError) => (
                              <li
                                key={`${rowError.field}-${rowError.code}`}
                                className="flex gap-1"
                              >
                                <CircleAlert
                                  aria-hidden="true"
                                  className="mt-0.5 size-3 shrink-0"
                                />
                                {rowError.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <FormAlert message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {imported ? "Done" : "Cancel"}
          </Button>
          {!imported && (
            <Button
              type="button"
              disabled={
                busy || file == null || preview == null || preview.invalid > 0
              }
              onClick={() => {
                if (file != null) commit.mutate(file);
              }}
            >
              {commit.isPending
                ? "Importing…"
                : `Import ${String(preview?.valid ?? 0)} ${plural(preview?.valid ?? 0)}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
