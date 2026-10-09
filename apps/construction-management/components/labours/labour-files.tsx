"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Skeleton } from "@repo/ui/components/skeleton";

import { FormAlert } from "@/components/auth/form-alert";
import { ImageUploader } from "@/components/profile/image-uploader";
import { fieldForCode } from "@/lib/server-errors";
import {
  LABOURS_KEY,
  addLabourDocument,
  deleteLabourDocument,
  labourDocumentsQuery,
  removeLabourPhoto,
  uploadLabourPhoto,
  type LabourResponse,
} from "@/src/queries/labours";
import { DOCUMENT_CONTENT_TYPES } from "@/src/shared-kernel/files/document-file";

const MB = 1024 * 1024;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function size(bytes: number): string {
  return bytes >= MB
    ? `${(bytes / MB).toFixed(1)} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Photo and Other Documents on Edit Labour (CM-207); each change saves at once. */
export function LabourFiles({ labour }: { labour: LabourResponse }) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: LABOURS_KEY });
  const documents = useQuery(labourDocumentsQuery(labour.id));
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const add = useMutation({
    mutationFn: (file: File) => addLabourDocument(labour.id, file),
    onSuccess: refresh,
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });
  const remove = useMutation({
    mutationFn: (documentId: string) =>
      deleteLabourDocument(labour.id, documentId),
    onSuccess: refresh,
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });

  const choose = (file: File | undefined) => {
    if (file == null) return;
    setError(undefined);
    if (!(DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      setError("Choose a PDF, PNG, JPEG or WebP file.");
      return;
    }
    if (file.size > 10 * MB) {
      setError("The file must be at most 10 MB.");
      return;
    }
    add.mutate(file);
  };

  return (
    <section aria-labelledby="labour-files" className="space-y-6">
      <h2 id="labour-files" className="font-semibold">
        Photo & documents
      </h2>
      <ImageUploader
        kind="member_photo"
        noun="photo"
        shape="circle"
        imageUrl={labour.photoUrl}
        fallback={initials(labour.name) || "?"}
        hint="PNG, JPEG or WebP, up to 10 MB."
        onUpload={async (file) => {
          await uploadLabourPhoto(labour.id, file);
          await refresh();
        }}
        onRemove={async () => {
          await removeLabourPhoto(labour.id);
          await refresh();
        }}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Other documents</h3>
          <Input
            ref={input}
            type="file"
            accept={DOCUMENT_CONTENT_TYPES.join(",")}
            aria-label="Choose document file"
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
            disabled={add.isPending}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" />
            {add.isPending ? "Uploading…" : "Add document"}
          </Button>
        </div>
        {documents.isPending ? (
          <Skeleton className="h-12 w-full" />
        ) : (documents.data?.items.length ?? 0) === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            No documents yet. Add an ID card, bank passbook or licence (PDF,
            PNG, JPEG or WebP, up to 10 MB).
          </p>
        ) : (
          <ul
            aria-label="Documents"
            className="divide-border divide-y rounded-lg border"
          >
            {documents.data?.items.map((document) => (
              <li
                key={document.id}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                <FileText
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0"
                />
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm hover:underline"
                >
                  {document.fileName}
                </a>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {size(document.bytes)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${document.fileName}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    setError(undefined);
                    remove.mutate(document.id);
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <FormAlert message={error} />
      </div>
    </section>
  );
}
