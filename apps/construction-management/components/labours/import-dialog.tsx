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
import { formatPaise } from "@/components/money/money-input";
import { fieldForCode } from "@/lib/server-errors";
import {
  LABOURS_KEY,
  LABOUR_TEMPLATE_URL,
  importLabours,
  type LabourImportPreview,
} from "@/src/queries/labours";

const MAX_BYTES = 5 * 1024 * 1024;

function wageText(values: LabourImportPreview["rows"][number]["values"]) {
  const wage = values.wagePerDay ?? values.wagePerMonth;
  if (wage == null) return "—";
  return `${formatPaise(wage)}${values.wagePerMonth != null ? " / month" : " / day"}`;
}

/**
 * Import labourers from the sample sheet (CM-207): download the sample,
 * upload it, check every row, then import all rows at once.
 */
export function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LabourImportPreview | null>(null);
  const [error, setError] = useState<string | undefined>();
  const check = useMutation({
    mutationFn: (chosen: File) => importLabours(chosen, true),
    onSuccess: setPreview,
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });
  const commit = useMutation({
    mutationFn: (chosen: File) => importLabours(chosen, false),
    onSuccess: async (result) => {
      setPreview(result);
      if (result.imported > 0)
        await queryClient.invalidateQueries({ queryKey: LABOURS_KEY });
    },
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });

  const reset = () => {
    setFile(null);
    setPreview(null);
    setError(undefined);
    check.reset();
    commit.reset();
  };

  const choose = (chosen: File | undefined) => {
    if (chosen == null) return;
    reset();
    if (!chosen.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose the Excel (.xlsx) sample sheet.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError("The file must be at most 5 MB.");
      return;
    }
    setFile(chosen);
    check.mutate(chosen);
  };

  const imported = preview != null && preview.imported > 0;
  const busy = check.isPending || commit.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Labours</DialogTitle>
          <DialogDescription>
            Fill in the sample sheet, one Labour per row, and upload it. Every
            row is checked first; nothing is added until every row is right.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={LABOUR_TEMPLATE_URL}
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
                ? `Imported ${String(preview.imported)} ${preview.imported === 1 ? "Labour" : "Labours"}.`
                : `${String(preview.valid)} ready · ${String(preview.invalid)} with errors`}
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border">
              <Table aria-label="Import preview">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Wage</TableHead>
                    <TableHead>Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map((row) => (
                    <TableRow key={row.row}>
                      <TableCell className="tabular-nums">{row.row}</TableCell>
                      <TableCell className="font-medium">
                        {row.values.name || "—"}
                      </TableCell>
                      <TableCell>{row.values.project ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {wageText(row.values)}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
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
                : `Import ${String(preview?.valid ?? 0)} ${preview?.valid === 1 ? "Labour" : "Labours"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
