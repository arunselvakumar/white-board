"use client";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@repo/ui/components/attachment";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { Download, FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_COUNT,
  attachmentHref,
  uploadAttachment,
  type AttachmentView,
} from "@/src/queries/class-work";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  return mimeType === "application/pdf" ? <FileText /> : <ImageIcon />;
}

/** Download links for the files on an item or Submission. */
export function AttachmentLinks({
  attachments,
}: {
  attachments: readonly AttachmentView[];
}) {
  if (attachments.length === 0) return null;
  return (
    <AttachmentGroup className="flex-wrap">
      {attachments.map((attachment) => (
        <Attachment key={attachment.id} size="sm">
          <AttachmentMedia>
            <FileIcon mimeType={attachment.mimeType} />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{attachment.name}</AttachmentTitle>
            <AttachmentDescription>
              {formatFileSize(attachment.sizeBytes)}
            </AttachmentDescription>
          </AttachmentContent>
          <AttachmentActions>
            <a
              href={attachmentHref(attachment.id)}
              aria-label={`Download ${attachment.name}`}
              className="text-muted-foreground hover:text-foreground inline-flex size-6 items-center justify-center rounded-md"
            >
              <Download className="size-4" />
            </a>
          </AttachmentActions>
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

/**
 * Picks and uploads files for an item or Submission. `value` is every file the
 * item will have when saved: kept ones and new uploads. Photos are shrunk
 * before upload; each file is uploaded on its own request (ADR-0033).
 */
export function AttachmentPicker({
  value,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  value: readonly AttachmentView[];
  onChange: (next: AttachmentView[]) => void;
  disabled?: boolean;
  /** Told while uploads run, so the form can hold its submit button. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const room = ATTACHMENT_MAX_COUNT - value.length - uploading.length;

  async function add(files: FileList | null) {
    if (files == null || files.length === 0) return;
    setError(null);
    const picked = Array.from(files);
    if (picked.length > room) {
      setError(`Attach up to ${ATTACHMENT_MAX_COUNT} files.`);
      return;
    }
    setUploading(picked.map((file) => file.name));
    onBusyChange?.(true);
    let next = [...value];
    try {
      for (const file of picked) {
        next = [...next, await uploadAttachment(file)];
        onChange(next);
        setUploading((names) => names.slice(1));
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload this file.",
      );
    } finally {
      setUploading([]);
      onBusyChange?.(false);
      if (input.current != null) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {(value.length > 0 || uploading.length > 0) && (
        <AttachmentGroup className="flex-wrap">
          {value.map((attachment) => (
            <Attachment key={attachment.id} size="sm">
              <AttachmentMedia>
                <FileIcon mimeType={attachment.mimeType} />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{attachment.name}</AttachmentTitle>
                <AttachmentDescription>
                  {formatFileSize(attachment.sizeBytes)}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={`Remove ${attachment.name}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(value.filter((item) => item.id !== attachment.id));
                  }}
                >
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
          {uploading.map((name) => (
            <Attachment key={`uploading:${name}`} size="sm" state="uploading">
              <AttachmentMedia>
                <Spinner />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{name}</AttachmentTitle>
                <AttachmentDescription>Uploading…</AttachmentDescription>
              </AttachmentContent>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ATTACHMENT_ACCEPT}
        aria-label="Attach files"
        onChange={(event) => {
          void add(event.currentTarget.files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || room <= 0 || uploading.length > 0}
        onClick={() => input.current?.click()}
      >
        <Paperclip /> Attach files
      </Button>
      <p className="text-muted-foreground text-xs">
        PDF, JPEG, or PNG. Up to {ATTACHMENT_MAX_COUNT} files, 4 MB each. Photos
        are resized before upload.
      </p>
      {error != null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
