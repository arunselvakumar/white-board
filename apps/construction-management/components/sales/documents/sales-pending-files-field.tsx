"use client";

import { ImagePlus, Paperclip, X } from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { DocumentFileIcon } from "@/components/projects/documents/document-file-icon";
import { formatBytes } from "@/lib/project-documents";
import {
  SALES_FILE_ROLE_RULES,
  checkSalesFile,
  salesFileHint,
  salesFileInputAccept,
} from "@/src/queries/sales-documents";
import {
  assertSalesFileRole,
  type SalesDocumentType,
  type SalesFileRole,
} from "@/src/sales/domain/document-files";

export type SalesPendingFilesFieldProps = {
  /** Which document the files will join (it decides the roles it takes). */
  documentType: SalesDocumentType;
  /** The role every file here gets: one Visiting Card, photos, a Booking Form. */
  role: SalesFileRole;
  /** The files picked so far (form state; nothing is uploaded yet). */
  value: readonly File[];
  onChange: (files: File[]) => void;
  label: string;
  disabled?: boolean;
  error?: string;
};

/** A picked image's object URL, alive as long as its `<img>`. */
function usePreviewRef(file: File) {
  return useCallback(
    (img: HTMLImageElement | null) => {
      if (img == null) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => {
        URL.revokeObjectURL(url);
      };
    },
    [file],
  );
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
  const preview = usePreviewRef(file);
  return (
    <li className="relative min-w-0">
      <span className="bg-muted text-muted-foreground flex aspect-square items-center justify-center overflow-hidden rounded-md border">
        {file.type.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL, not a served image
          <img ref={preview} alt="" className="size-full object-cover" />
        ) : (
          <DocumentFileIcon
            fileName={file.name}
            contentType={file.type}
            className="size-1/3 max-h-10 max-w-10"
          />
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
 * Files of one role picked on a **new** inquiry or booking, before it has
 * an id (CM-1003): it only holds `File`s, with thumbnails; nothing goes up
 * until the form is saved, then `useUploadPendingSalesFiles(type)` uploads
 * them. Built generically, so the Booking form (CM-1006) uses it for its
 * Booking Form and photos. A role that keeps one file (Visiting Card,
 * Booking Form) takes one; files the role would refuse are not added and
 * say why.
 */
export function SalesPendingFilesField({
  documentType,
  role,
  value,
  onChange,
  label,
  disabled = false,
  error,
}: SalesPendingFilesFieldProps) {
  assertSalesFileRole(documentType, role);
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const rule = SALES_FILE_ROLE_RULES[role];
  const single = rule.max === 1;
  const photos = rule.accept === "images";
  const room = rule.max - value.length;

  const pick = (picked: File[]) => {
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of picked) {
      const problem = checkSalesFile(role, file);
      if (problem != null) problems.push(`${file.name}: ${problem.message}`);
      else if (!single && accepted.length >= room)
        problems.push(
          `${file.name}: add at most ${String(rule.max)} ${rule.label}.`,
        );
      else accepted.push(file);
    }
    setRefused(problems);
    if (accepted.length === 0) return;
    // A single-file role swaps its file for the new pick.
    onChange(single ? accepted.slice(0, 1) : [...value, ...accepted]);
  };

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {value.length > 0 ? (
        <ul
          aria-label={`${label} to upload`}
          className="grid grid-cols-3 gap-3 sm:grid-cols-4"
        >
          {value.map((file, index) => (
            <PendingTile
              key={`${file.name}-${String(file.size)}-${String(file.lastModified)}-${String(index)}`}
              file={file}
              disabled={disabled}
              onRemove={() => {
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
          multiple={!single}
          accept={salesFileInputAccept(role)}
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
          disabled={disabled || (!single && room <= 0)}
          onClick={() => input.current?.click()}
        >
          {photos ? (
            <ImagePlus aria-hidden="true" />
          ) : (
            <Paperclip aria-hidden="true" />
          )}
          {single
            ? value.length === 0
              ? `Add ${label}`
              : `Replace ${label}`
            : "Add photos"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {salesFileHint(role)} {single ? "" : `Up to ${String(rule.max)}. `}
        Uploaded when you save.
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
