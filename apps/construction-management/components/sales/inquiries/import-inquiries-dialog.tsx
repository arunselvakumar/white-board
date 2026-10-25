"use client";

import { CircleCheck, Download, FileSpreadsheet } from "lucide-react";
import { useRef, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { QueryHttpError } from "@/src/queries/http";
import {
  inquirySampleUrl,
  useImportInquiries,
  type InquiryImportRowError,
} from "@/src/queries/sales-inquiries";

const MAX_BYTES = 2 * 1024 * 1024;

function rowErrors(error: unknown): InquiryImportRowError[] | null {
  if (!(error instanceof QueryHttpError) || error.code !== "IMPORT_HAS_ERRORS")
    return null;
  const details = error.details as
    { errors?: InquiryImportRowError[] } | undefined;
  return details?.errors ?? [];
}

/**
 * Import inquiries (CM-1007, ADR CM-0022 §9): download the sample (its
 * Lists sheet has the Project's Lead Sources, Funnel Stages, Wings and Team
 * Members), fill one lead per row, upload it. Every row becomes an
 * inquiry, or none does and each problem is listed by row and column. A
 * mobile or email already on another inquiry is a problem unless
 * **Import duplicates too** is ticked.
 */
export function ImportInquiriesDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useImportInquiries(projectId);
  const [duplicates, setDuplicates] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [errors, setErrors] = useState<InquiryImportRowError[] | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  const reset = () => {
    setError(undefined);
    setErrors(null);
    setImported(null);
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
    upload.mutate(
      { file, allowDuplicates: duplicates },
      {
        onSuccess: (result) => {
          setImported(result.imported);
        },
        onError: (failure) => {
          setErrors(rowErrors(failure));
          setError(fieldForCode(failure, {}).message);
        },
      },
    );
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
          <DialogTitle>Import inquiries</DialogTitle>
          <DialogDescription>
            Fill in the sample sheet, one lead per row, up to 1,000. Lead
            Source, Funnel Stage and Wing must be names this Project already
            has; the Assignee is a Team Member&apos;s name or mobile. Rows are
            saved all or none.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id="import-duplicates"
            checked={duplicates}
            onCheckedChange={(checked) => {
              setDuplicates(checked);
            }}
          />
          <Label htmlFor="import-duplicates" className="font-normal">
            Import duplicates too (a mobile or email another inquiry has)
          </Label>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            href={inquirySampleUrl(projectId)}
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
        {imported != null ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {imported} {imported === 1 ? "inquiry" : "inquiries"} imported.
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
            {imported != null ? "Done" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
