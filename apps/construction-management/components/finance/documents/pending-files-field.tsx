"use client";

import { Paperclip, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { formatBytes } from "@/lib/project-documents";
import {
  FINANCE_DOCUMENT_FILES_MAX,
  FINANCE_FILE_INPUT_ACCEPT,
  checkFinanceFile,
  financeFileHint,
} from "@/src/queries/finance-documents";
import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";

import { financeFilesHeading } from "./finance-file-parts";

export type FinancePendingFilesFieldProps = {
  /** Which document the files will join (it names the field). */
  documentType: FinanceDocumentType;
  /** The files picked so far (form state; nothing is uploaded yet). */
  value: readonly File[];
  onChange: (files: File[]) => void;
  /** "Photos & receipts" on a voucher, "Files" elsewhere, unless given. */
  label?: string;
  disabled?: boolean;
  /** A form error to show under the field. */
  error?: string;
};

/**
 * Preview URLs of picked images, one per `File`. A URL is revoked when its
 * tile is removed; the rest go with the page.
 */
const previews = new WeakMap<File, string>();

function previewUrl(file: File): string | null {
  if (!file.type.startsWith("image/")) return null;
  let url = previews.get(file);
  if (url == null) {
    url = URL.createObjectURL(file);
    previews.set(file, url);
  }
  return url;
}

function forgetPreview(file: File): void {
  const url = previews.get(file);
  if (url == null) return;
  URL.revokeObjectURL(url);
  previews.delete(file);
}

function PendingTile({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled: boolean;
  onRemove: () => void;
}) {
  const preview = previewUrl(file);
  return (
    <li className="relative min-w-0">
      <span className="bg-muted text-muted-foreground flex aspect-square items-center justify-center overflow-hidden rounded-md border">
        {preview == null ? (
          <DocumentFileIcon
            fileName={file.name}
            contentType={file.type}
            className="size-1/3 max-h-10 max-w-10"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a served image
          <img src={preview} alt="" className="size-full object-cover" />
        )}
      </span>
      <span className="mt-1.5 block truncate text-sm font-medium">
        {file.name}
      </span>
      <span className="text-muted-foreground block truncate text-xs">
        {formatBytes(file.size)}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon-xs"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        className="absolute top-1.5 right-1.5 shadow-sm"
        onClick={onRemove}
      >
        <X />
      </Button>
    </li>
  );
}

/**
 * Receipts, photos or invoice copies picked on a **new** finance form,
 * before the document has an id (ADR CM-0017). It only holds `File`s, with
 * thumbnails: nothing goes up until the form is saved, then
 * `useUploadPendingFinanceFiles(type)` uploads them to the new document.
 * Files the document would refuse (not a PDF or an image, over 25 MB) are
 * not added, and say why. Use it through react-hook-form's `Controller`:
 *
 * ```tsx
 * <Controller control={form.control} name="files" render={({ field }) => (
 *   <FinancePendingFilesField documentType="petty_cash_voucher" value={field.value} onChange={field.onChange} />
 * )} />
 * ```
 *
 * On an existing document show `FinanceDocumentFiles` instead.
 */
export function FinancePendingFilesField({
  documentType,
  value,
  onChange,
  label = financeFilesHeading(documentType),
  disabled = false,
  error,
}: FinancePendingFilesFieldProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const room = FINANCE_DOCUMENT_FILES_MAX - value.length;

  const pick = (picked: File[]) => {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      const problem = checkFinanceFile(file);
      if (problem != null) problems.push(`${file.name}: ${problem.message}`);
      else if (accepted.length >= room)
        problems.push(
          `${file.name}: a document keeps at most ${String(FINANCE_DOCUMENT_FILES_MAX)} files.`,
        );
      else accepted.push(file);
    }
    setRefused(problems);
    if (accepted.length > 0) onChange([...value, ...accepted]);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {value.length > 0 ? (
        <ul
          aria-label={`${label} to upload`}
          className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6"
        >
          {value.map((file, index) => (
            <PendingTile
              key={`${file.name}-${String(file.size)}-${String(file.lastModified)}-${String(index)}`}
              file={file}
              disabled={disabled}
              onRemove={() => {
                forgetPreview(file);
                setRefused([]);
                onChange(value.filter((_, at) => at !== index));
              }}
            />
          ))}
        </ul>
      ) : null}
      <div className="relative">
        <Input
          ref={input}
          id={id}
          type="file"
          multiple
          accept={FINANCE_FILE_INPUT_ACCEPT}
          aria-label={`Choose files for ${label}`}
          className="sr-only top-0 left-0"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length > 0) pick(picked);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || room <= 0}
          onClick={() => input.current?.click()}
        >
          <Paperclip aria-hidden="true" />
          Add files
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {financeFileHint()} They upload when you save.
      </p>
      {refused.length > 0 ? (
        <ul aria-label="Not added" className="text-destructive text-xs">
          {refused.map((line) => (
            <li key={line} className="break-words">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}
