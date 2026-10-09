"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip, RotateCw, X } from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@repo/ui/components/attachment";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import { checkDocumentFile, formatBytes } from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";
import {
  projectDocumentsKey,
  projectDocumentsQuery,
  uploadProjectDocument,
  type ProjectDocument,
} from "@/src/queries/project-documents";

import { DeleteDocumentDialog } from "./delete-document-dialog";
import { DocumentFileIcon } from "./document-file-icon";
import { canRetry, useDocumentUploads } from "./use-document-uploads";

/** A file picked on Add Project, uploaded once the Project is saved. */
export type HeldFile = { id: string; file: File; kind: ProjectDocumentKind };

export type DocumentAttachmentsProps = {
  /** Null on Add Project: files are held until the Project exists. */
  projectId: string | null;
  kind: ProjectDocumentKind;
  /** The paper's name for screen readers, e.g. "Quotation". */
  label: string;
  held: readonly HeldFile[];
  onHeldChange: (next: HeldFile[]) => void;
  disabled?: boolean;
  /** Placement of the paperclip's grid cell, e.g. a column start. */
  buttonClassName?: string;
  /** Placement of the chip list; it spans the whole row by default. */
  chipsClassName?: string;
};

/**
 * A paperclip button plus the paper's files as chips under its row. With a
 * Project, a picked file uploads at once with progress and a chip's remove
 * deletes it (after confirming); without one, it joins `held`.
 *
 * Placing it: it renders two siblings and no wrapper, so put it straight
 * inside the paper's grid row. The button (an `h-8` icon button,
 * `self-end` so it lines up with the inputs under their labels) takes one
 * cell; the chip list, rendered only when there are files, is
 * `col-span-full` and wraps onto the next line under the number and date:
 *
 * ```tsx
 * <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2
 *                 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
 *   <Field label="PO / WO No." … />
 *   <Field label="Date" className="max-sm:col-span-full max-sm:row-start-2" … />
 *   <DocumentAttachments kind="client_order" label="PO / WO" … />
 * </div>
 * ```
 *
 * `held` may hold every paper's files: only this `kind` is shown, and
 * `onHeldChange` gets the whole list back with this paper's changes.
 */
export function DocumentAttachments(props: DocumentAttachmentsProps) {
  return props.projectId == null ? (
    <HeldAttachments {...props} />
  ) : (
    <SavedAttachments {...props} projectId={props.projectId} />
  );
}

export type HeldUploadStatus = { done: number; total: number } | null;

/**
 * Uploads the held files after Add Project; reports which failed. One at a
 * time, in order; `status.done` counts files tried so far (failed ones
 * too) and `status` is null again once all are tried. Never throws.
 */
export function useUploadHeldFiles(): {
  upload: (
    projectId: string,
    held: readonly HeldFile[],
  ) => Promise<{ failed: HeldFile[] }>;
  status: HeldUploadStatus;
} {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<HeldUploadStatus>(null);
  const upload = useCallback(
    async (projectId: string, held: readonly HeldFile[]) => {
      const failed: HeldFile[] = [];
      if (held.length === 0) return { failed };
      const total = held.length;
      setStatus({ done: 0, total });
      for (const [index, item] of held.entries()) {
        try {
          await uploadProjectDocument(projectId, item.file, item.kind);
        } catch {
          failed.push(item);
        }
        setStatus({ done: index + 1, total });
      }
      try {
        await queryClient.invalidateQueries({
          queryKey: projectDocumentsKey(projectId),
        });
      } catch {
        // The list refreshes on its next read.
      }
      setStatus(null);
      return { failed };
    },
    [queryClient],
  );
  return { upload, status };
}

/** The paperclip: opens the file picker and takes files dropped on it. */
function AttachButton({
  label,
  disabled,
  onFiles,
  className,
}: {
  label: string;
  disabled: boolean;
  className?: string | undefined;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const accept = (event: DragEvent) => {
    if (disabled || !event.dataTransfer.types.includes("Files")) return false;
    event.preventDefault();
    return true;
  };
  return (
    <div className={cn("relative self-end", className)}>
      <Input
        ref={input}
        type="file"
        multiple
        aria-label={`Choose files for ${label}`}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Attach file to ${label}`}
              disabled={disabled}
              className={cn(
                dragging && "border-ring ring-ring/50 bg-muted ring-3",
              )}
              onClick={() => input.current?.click()}
              onDragEnter={(event) => {
                if (accept(event)) setDragging(true);
              }}
              onDragOver={(event) => {
                accept(event);
              }}
              onDragLeave={() => {
                setDragging(false);
              }}
              onDrop={(event) => {
                setDragging(false);
                if (!accept(event)) return;
                const files = Array.from(event.dataTransfer.files);
                if (files.length > 0) onFiles(files);
              }}
            />
          }
        >
          <Paperclip />
        </TooltipTrigger>
        <TooltipContent>Attach or drop files</TooltipContent>
      </Tooltip>
    </div>
  );
}

type ChipProps = {
  fileName: string;
  contentType?: string;
  description: ReactNode;
  state: "uploading" | "error" | "done" | "idle";
  /** Opens the saved file in a new tab. */
  href?: string;
  remove: { label: string; onClick: () => void; disabled?: boolean };
  retry?: () => void;
};

function FileChip({
  fileName,
  contentType,
  description,
  state,
  href,
  remove,
  retry,
}: ChipProps) {
  return (
    <li className="max-w-full min-w-0">
      <Attachment
        size="xs"
        state={state}
        title={fileName}
        className="max-w-72 min-w-0 pr-1"
      >
        <AttachmentMedia>
          <DocumentFileIcon fileName={fileName} contentType={contentType} />
        </AttachmentMedia>
        <AttachmentContent>
          <AttachmentTitle>{fileName}</AttachmentTitle>
          <AttachmentDescription
            className={cn(state === "error" && "whitespace-normal")}
          >
            {description}
          </AttachmentDescription>
        </AttachmentContent>
        {href == null ? null : (
          <AttachmentTrigger
            render={
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${fileName}`}
              />
            }
          />
        )}
        <AttachmentActions>
          {retry == null ? null : (
            <AttachmentAction aria-label={`Retry ${fileName}`} onClick={retry}>
              <RotateCw />
            </AttachmentAction>
          )}
          <AttachmentAction
            aria-label={remove.label}
            disabled={remove.disabled}
            onClick={remove.onClick}
          >
            <X />
          </AttachmentAction>
        </AttachmentActions>
      </Attachment>
    </li>
  );
}

function ChipList({
  label,
  className,
  children,
}: {
  label: string;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <ul
      aria-label={`${label} files`}
      className={cn("col-span-full flex min-w-0 flex-wrap gap-2", className)}
    >
      {children}
    </ul>
  );
}

/** Edit Project: the paper's saved files; picks upload at once. */
function SavedAttachments({
  projectId,
  kind,
  label,
  disabled = false,
  buttonClassName,
  chipsClassName,
}: DocumentAttachmentsProps & { projectId: string }) {
  const { data } = useQuery(projectDocumentsQuery(projectId));
  const { uploads, add, retry, dismiss } = useDocumentUploads(projectId);
  const [deleting, setDeleting] = useState<ProjectDocument | null>(null);
  const saved = (data?.items ?? []).filter((item) => item.kind === kind);
  // A finished upload is already in `saved`: the list refreshes first.
  const pending = uploads.filter(
    (upload) => upload.kind === kind && upload.state !== "done",
  );

  const chips = [
    ...saved.map((document) => (
      <FileChip
        key={document.id}
        fileName={document.fileName}
        contentType={document.contentType}
        description={formatBytes(document.bytes)}
        state="done"
        href={document.viewable ? document.url : `${document.url}?download=1`}
        remove={{
          label: `Delete ${document.fileName}`,
          disabled,
          onClick: () => {
            setDeleting(document);
          },
        }}
      />
    )),
    ...pending.map((upload) => (
      <FileChip
        key={upload.id}
        fileName={upload.file.name}
        description={
          upload.state === "error"
            ? upload.error
            : upload.progress >= 100
              ? "Saving…"
              : `Uploading ${String(upload.progress)}%`
        }
        state={upload.state === "error" ? "error" : "uploading"}
        retry={
          canRetry(upload)
            ? () => {
                retry(upload.id);
              }
            : undefined
        }
        remove={{
          label:
            upload.state === "error"
              ? `Dismiss ${upload.file.name}`
              : `Cancel upload of ${upload.file.name}`,
          onClick: () => {
            dismiss(upload.id);
          },
        }}
      />
    )),
  ];

  return (
    <>
      <AttachButton
        label={label}
        disabled={disabled}
        className={buttonClassName}
        onFiles={(files) => {
          add(files, kind);
        }}
      />
      {chips.length > 0 ? (
        <ChipList label={label} className={chipsClassName}>
          {chips}
        </ChipList>
      ) : null}
      <DeleteDocumentDialog
        projectId={projectId}
        document={deleting}
        onClose={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}

type Rejected = { id: string; file: File; message: string };

/** Add Project: picks wait in `held` until the Project is saved. */
function HeldAttachments({
  kind,
  label,
  held,
  onHeldChange,
  disabled = false,
  buttonClassName,
  chipsClassName,
}: DocumentAttachmentsProps) {
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const mine = held.filter((item) => item.kind === kind);

  const pick = (files: File[]) => {
    const accepted: HeldFile[] = [];
    const refused: Rejected[] = [];
    for (const file of files) {
      const problem = checkDocumentFile(file);
      const id = crypto.randomUUID();
      if (problem == null) accepted.push({ id, file, kind });
      else refused.push({ id, file, message: problem.message });
    }
    if (refused.length > 0) setRejected((current) => [...current, ...refused]);
    if (accepted.length > 0) onHeldChange([...held, ...accepted]);
  };

  const chips = [
    ...mine.map((item) => (
      <FileChip
        key={item.id}
        fileName={item.file.name}
        contentType={item.file.type}
        description={`${formatBytes(item.file.size)} · Uploads when you save`}
        state="idle"
        remove={{
          label: `Remove ${item.file.name}`,
          disabled,
          onClick: () => {
            onHeldChange(held.filter((other) => other.id !== item.id));
          },
        }}
      />
    )),
    ...rejected.map((item) => (
      <FileChip
        key={item.id}
        fileName={item.file.name}
        description={item.message}
        state="error"
        remove={{
          label: `Dismiss ${item.file.name}`,
          onClick: () => {
            setRejected((current) =>
              current.filter((other) => other.id !== item.id),
            );
          },
        }}
      />
    )),
  ];

  return (
    <>
      <AttachButton
        label={label}
        disabled={disabled}
        className={buttonClassName}
        onFiles={pick}
      />
      {chips.length > 0 ? (
        <ChipList label={label} className={chipsClassName}>
          {chips}
        </ChipList>
      ) : null}
    </>
  );
}
