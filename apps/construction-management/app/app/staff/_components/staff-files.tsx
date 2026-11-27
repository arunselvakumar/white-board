"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { FileTextIcon } from "@phosphor-icons/react/ssr";
import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { EmptyState } from "@repo/ui/components/empty-state";

import { FormAlert } from "@/components/auth/form-alert";
import { FormSection } from "@/components/forms/form-section";
import { ImageUploader } from "@/app/app/_components/profile/image-uploader";
import { fieldForCode } from "@/lib/server-errors";
import type { ConstructionLabourPartyDocumentResponseModel } from "@/app/api/construction/labour/_party-files/party-file-models";
import { StaffDocumentsSkeleton } from "./staff-skeletons";
import { DOCUMENT_CONTENT_TYPES } from "@/src/shared-kernel/files/document-file";

/** An Employee's or Vendor's documents: both are "party" files. */
type StaffDocuments = { items: ConstructionLabourPartyDocumentResponseModel[] };

const MB = 1024 * 1024;

const PHOTO_HINT =
  "Take one with the camera, or upload a PNG, JPEG or WebP up to 10 MB.";

export function initials(name: string): string {
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

/** How one kind of staff (Employee, Vendor) stores its photo and documents. */
export type StaffFilesApi = {
  /** Invalidated after each change, so the record's photo URL refreshes. */
  queryKey: QueryKey;
  documentsQuery: (
    id: string,
  ) => UseQueryOptions<StaffDocuments, Error, StaffDocuments, string[]>;
  uploadPhoto: (id: string, file: File) => Promise<unknown>;
  removePhoto: (id: string) => Promise<unknown>;
  addDocument: (id: string, file: File) => Promise<unknown>;
  deleteDocument: (id: string, documentId: string) => Promise<unknown>;
};

/**
 * Photo & documents, the first card on Edit Employee and Edit Vendor. The
 * photo is taken with the camera or uploaded; each change saves at once.
 */
export function StaffFiles({
  owner,
  api,
}: {
  owner: { id: string; name: string; photoUrl: string | null };
  api: StaffFilesApi;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: api.queryKey });
  const documents = useQuery(api.documentsQuery(owner.id));
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const add = useMutation({
    mutationFn: (file: File) => api.addDocument(owner.id, file),
    onSuccess: refresh,
    onError: (caught) => {
      setError(fieldForCode(caught, {}).message);
    },
  });
  const remove = useMutation({
    mutationFn: (documentId: string) =>
      api.deleteDocument(owner.id, documentId),
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
    <FormSection title="Photo & documents">
      <ImageUploader
        kind="member_photo"
        noun="photo"
        shape="circle"
        camera
        imageUrl={owner.photoUrl}
        fallback={initials(owner.name) || "?"}
        hint={PHOTO_HINT}
        onUpload={async (file) => {
          await api.uploadPhoto(owner.id, file);
          await refresh();
        }}
        onRemove={async () => {
          await api.removePhoto(owner.id);
          await refresh();
        }}
      />
      <div className="space-y-3">
        {/* `relative`: the hidden file input stays inside, not off the page. */}
        <div className="relative flex flex-wrap items-center justify-between gap-2">
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
          <StaffDocumentsSkeleton />
        ) : (documents.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            tone="blue"
            size="md"
            title="No documents yet."
            description="Add an ID card, bank passbook or licence (PDF, PNG, JPEG or WebP, up to 10 MB)."
            className="bg-card text-muted-foreground rounded-lg border border-dashed p-4 text-sm"
          />
        ) : (
          <ul
            aria-label="Documents"
            className="bg-card divide-border divide-y rounded-lg border"
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
    </FormSection>
  );
}

/** A photo picked on Add, with its preview (freed when replaced or removed). */
export type PendingPhotoValue = { file: File; previewUrl: string };

/**
 * The photo on Add Employee and Add Vendor: taken or chosen now, kept in the
 * browser, and uploaded once the record is saved. Documents need the saved
 * record, so they come after Save.
 */
export function PendingPhoto({
  name,
  value,
  onChange,
}: {
  /** The name typed so far, for the initials. */
  name: string;
  value: PendingPhotoValue | null;
  onChange: (photo: PendingPhotoValue | null) => void;
}) {
  return (
    <FormSection
      title="Photo & documents"
      hint="The photo is saved with them. Add documents after you save."
    >
      <ImageUploader
        kind="member_photo"
        noun="photo"
        shape="circle"
        camera
        imageUrl={value?.previewUrl ?? null}
        fallback={initials(name) || "?"}
        hint={PHOTO_HINT}
        onUpload={(file) => {
          if (value != null) URL.revokeObjectURL(value.previewUrl);
          onChange({ file, previewUrl: URL.createObjectURL(file) });
          return Promise.resolve();
        }}
        onRemove={() => {
          if (value != null) URL.revokeObjectURL(value.previewUrl);
          onChange(null);
          return Promise.resolve();
        }}
      />
    </FormSection>
  );
}
