"use client";

import { CircleAlert, Copy, Download, FileSpreadsheet } from "lucide-react";
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
import {
  COMPANY_IMPORT_TEMPLATE_URL,
  companyErrorMessage,
  useImportCompanies,
  type ProspectCompanyImportResult,
} from "@/src/queries/marketing-companies";

const MAX_BYTES = 5 * 1024 * 1024;

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function summary(result: ProspectCompanyImportResult): string {
  const added =
    result.created === 0
      ? "No Prospect Companies were added."
      : `Added ${count(result.created, "Prospect Company", "Prospect Companies")}.`;
  const skipped = [
    result.duplicates > 0
      ? count(result.duplicates, "duplicate", "duplicates")
      : null,
    result.invalid > 0
      ? count(result.invalid, "row with errors", "rows with errors")
      : null,
  ].filter((part) => part != null);
  return skipped.length === 0
    ? added
    : `${added} ${skipped.join(" and ")} not added.`;
}

/**
 * Import Prospect Companies from the Excel template (ADR CM-0040 §11):
 * download the template, upload it filled in, and see what was added and
 * which rows were not, by row: duplicate names and rows with errors.
 */
export function ImportCompaniesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProspectCompanyImportResult | null>(
    null,
  );
  const [error, setError] = useState<string | undefined>();
  const upload = useImportCompanies();

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(undefined);
    upload.reset();
  };

  const choose = (chosen: File | undefined) => {
    if (chosen == null) return;
    reset();
    if (!chosen.name.toLowerCase().endsWith(".xlsx")) {
      setError("Choose the Excel (.xlsx) template.");
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError("The file must be at most 5 MB.");
      return;
    }
    setFile(chosen);
  };

  // Closing mid-upload would drop the summary of rows already saved.
  const close = () => {
    if (upload.isPending) return;
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Prospect Companies</DialogTitle>
          <DialogDescription>
            Fill in the template, one Prospect Company per row, and upload it.
            Each row is added at New and assigned to you. Names already in use
            and rows with errors are listed here, not added.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={COMPANY_IMPORT_TEMPLATE_URL}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Download template
          </a>
          <Input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label="Choose Excel file"
            // `w-px` over the Input's own `w-full`: hidden, it must not
            // widen the dialog on a phone.
            className="sr-only w-px"
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
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            <FileSpreadsheet aria-hidden="true" />
            {file == null ? "Choose filled template" : "Choose another file"}
          </Button>
          {file != null && (
            <span className="text-muted-foreground min-w-0 truncate text-sm">
              {file.name}
            </span>
          )}
        </div>

        {result != null && (
          <div className="min-w-0 space-y-3">
            <p role="status" className="text-sm font-medium">
              {summary(result)}
            </p>
            {result.problems.length > 0 && (
              <div className="bg-card max-h-80 overflow-auto rounded-lg border">
                <Table aria-label="Rows not imported">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Row</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Why</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.problems.map((problem) => (
                      <TableRow key={problem.row}>
                        <TableCell className="tabular-nums">
                          {problem.row}
                        </TableCell>
                        <TableCell className="font-medium whitespace-normal">
                          {problem.name ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-col items-start gap-1">
                            {problem.reason === "duplicate" ? (
                              <Badge variant="secondary">
                                <Copy aria-hidden="true" />
                                Duplicate
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <CircleAlert aria-hidden="true" />
                                Error
                              </Badge>
                            )}
                            <span className="text-muted-foreground text-xs">
                              {problem.message}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
        <FormAlert message={error} />
        <DialogFooter>
          {result == null ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={upload.isPending}
                onClick={close}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={file == null || upload.isPending}
                onClick={() => {
                  if (file == null) return;
                  setError(undefined);
                  upload.mutate(file, {
                    onSuccess: setResult,
                    onError: (caught) => {
                      setError(companyErrorMessage(caught));
                    },
                  });
                }}
              >
                {upload.isPending ? "Importing…" : "Import"}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={close}>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
