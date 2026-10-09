"use client";

import { CircleCheck, RotateCw, Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { Button } from "@repo/ui/components/button";
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
import { Progress } from "@repo/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

import {
  PROJECT_DOCUMENT_KIND_LABELS,
  PROJECT_DOCUMENT_KIND_ORDER,
  formatBytes,
} from "@/lib/project-documents";
import type { ProjectDocumentKind } from "@/src/projects/domain/project-document-rules";

import { DocumentFileIcon } from "./document-file-icon";
import {
  canRetry,
  type DocumentUpload,
  type useDocumentUploads,
} from "./use-document-uploads";

const KIND_ITEMS = PROJECT_DOCUMENT_KIND_ORDER.map((kind) => ({
  value: kind,
  label: PROJECT_DOCUMENT_KIND_LABELS[kind],
}));

type Uploads = ReturnType<typeof useDocumentUploads>;

function UploadRow({
  upload,
  uploads,
}: {
  upload: DocumentUpload;
  uploads: Uploads;
}) {
  const name = upload.file.name;
  const status =
    upload.state === "done"
      ? "Done"
      : upload.state === "error"
        ? upload.error
        : upload.progress >= 100
          ? "Saving…"
          : `${String(upload.progress)}%`;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
        <DocumentFileIcon fileName={name} className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              upload.state === "error"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {upload.state === "error" ? null : status}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          {PROJECT_DOCUMENT_KIND_LABELS[upload.kind]} ·{" "}
          {formatBytes(upload.file.size)}
        </p>
        {upload.state === "uploading" ? (
          <Progress value={upload.progress} aria-label={`Uploading ${name}`} />
        ) : null}
        {upload.state === "error" ? (
          <p role="alert" className="text-destructive text-xs">
            {status}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">
        {upload.state === "done" ? (
          <CircleCheck
            aria-hidden="true"
            className="text-primary m-1.5 size-4"
          />
        ) : null}
        {canRetry(upload) ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Retry ${name}`}
            onClick={() => {
              uploads.retry(upload.id);
            }}
          >
            <RotateCw />
          </Button>
        ) : null}
        {upload.state === "done" ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              upload.state === "uploading"
                ? `Cancel upload of ${name}`
                : `Dismiss ${name}`
            }
            onClick={() => {
              uploads.dismiss(upload.id);
            }}
          >
            <X />
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Documents tab → Upload: choose the paper, then pick or drop files; each
 * file shows its own progress. Closing lets running uploads finish; they
 * show again on reopening.
 */
export function UploadDocumentsDialog({
  open,
  onOpenChange,
  uploads,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  uploads: Uploads;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ProjectDocumentKind>("other");
  const [dragging, setDragging] = useState(false);

  const accept = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return false;
    event.preventDefault();
    return true;
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) uploads.clearSettled();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload files</DialogTitle>
          <DialogDescription>
            Up to 25 MB each. Programs can&apos;t be added.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="upload-document-kind">Paper</Label>
          <Select
            items={KIND_ITEMS}
            value={kind}
            onValueChange={(value) => {
              if (value != null) setKind(value);
            }}
          >
            <SelectTrigger
              id="upload-document-kind"
              size="lg"
              className="w-full min-w-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {KIND_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div
          data-dragging={dragging ? "" : undefined}
          className="border-input data-dragging:border-ring data-dragging:bg-muted/60 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors"
          onDragEnter={(event) => {
            if (accept(event)) setDragging(true);
          }}
          onDragOver={(event) => {
            accept(event);
          }}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setDragging(false);
          }}
          onDrop={(event) => {
            setDragging(false);
            if (!accept(event)) return;
            uploads.add(Array.from(event.dataTransfer.files), kind);
          }}
        >
          <Upload aria-hidden="true" className="text-muted-foreground size-5" />
          <p className="text-muted-foreground text-sm">Drop files here, or</p>
          <Input
            ref={input}
            type="file"
            multiple
            aria-label="Files to upload"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) uploads.add(files, kind);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => input.current?.click()}
          >
            Choose files
          </Button>
        </div>
        {uploads.uploads.length === 0 ? null : (
          <ul aria-label="Uploads" className="divide-border -my-1 divide-y">
            {uploads.uploads.map((upload) => (
              <UploadRow key={upload.id} upload={upload} uploads={uploads} />
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button
            type="button"
            onClick={() => {
              uploads.clearSettled();
              onOpenChange(false);
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
