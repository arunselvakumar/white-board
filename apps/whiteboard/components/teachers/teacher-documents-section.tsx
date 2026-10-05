"use client";

import { useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import type {
  TeacherDocument,
  TeacherDocumentInput,
} from "@/src/queries/teachers";
import { withAppBasePath } from "@/lib/app-base-path";
import { encodeTeacherDocument } from "./teacher-files";

const documentOptions = [
  { value: "certificate", label: "Certificate" },
  { value: "identity", label: "ID proof" },
  { value: "background_check", label: "Background check" },
  { value: "other", label: "Other" },
];
const schema = z.object({
  kind: z.enum(["certificate", "identity", "background_check", "other"]),
});

export function TeacherDocumentsSection({
  teacherId,
  documents,
  disabled = false,
  onAdd,
  onRemove,
}: {
  teacherId: string;
  documents: TeacherDocument[];
  disabled?: boolean;
  onAdd: (input: TeacherDocumentInput) => Promise<void>;
  onRemove: (documentId: string) => Promise<void>;
}) {
  const { control } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { kind: "certificate" },
  });
  const kind = useWatch({ control, name: "kind" });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<TeacherDocument | null>(
    null,
  );

  async function add(file?: File) {
    if (file == null) return;
    setError(null);
    setBusy(true);
    try {
      await onAdd(await encodeTeacherDocument(kind, file));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not upload this document.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border p-5 sm:p-7">
      <div>
        <h2 className="text-lg font-semibold">Documents</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Private certificates, ID proof, and background check records. Only the
          Owner can open them.
        </p>
      </div>
      {!disabled && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-64">
            <Label htmlFor="teacher-document-kind">Document type</Label>
            <Controller
              name="kind"
              control={control}
              render={({ field }) => (
                <Select
                  items={documentOptions}
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value ?? "certificate");
                  }}
                >
                  <SelectTrigger id="teacher-document-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    {documentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void add(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={busy || documents.length >= 10}
            onClick={() => input.current?.click()}
          >
            <Plus className="size-4" /> {busy ? "Uploading…" : "Add document"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {documents.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents added.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {documents.map((document) => (
            <li
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{document.name}</p>
                <p className="text-muted-foreground text-xs">
                  {
                    documentOptions.find(
                      (option) => option.value === document.kind,
                    )?.label
                  }{" "}
                  · {Math.ceil(document.sizeBytes / 1024)} KB
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={withAppBasePath(
                        `/api/teachers/${teacherId}/documents/${document.id}`,
                      )}
                      aria-label={`Download ${document.name}`}
                    />
                  }
                >
                  <Download className="size-4" /> Download
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${document.name}`}
                  onClick={() => {
                    setPendingRemove(document);
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog
        open={pendingRemove != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemove?.name ?? "This document"} will no longer appear on
              the Teacher profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              type="button"
              onClick={() => {
                const document = pendingRemove;
                setPendingRemove(null);
                if (document != null)
                  void onRemove(document.id).catch(() => {
                    setError("Could not remove this document.");
                  });
              }}
            >
              Remove document
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
