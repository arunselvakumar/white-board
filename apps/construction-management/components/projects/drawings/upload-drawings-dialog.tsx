"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Upload, X } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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

import { FieldError } from "@/components/auth/field-error";
import { formatBytes } from "@/lib/project-documents";
import { acceptOf, maxBytesOf } from "@/lib/project-uploads";
import {
  DRAWING_NAME_MAX,
  drawingNameFromFile,
} from "@/src/projects/domain/drawing";

import { DocumentFileIcon } from "../documents/document-file-icon";
import { DrawingUploadRow } from "./drawing-upload-row";
import type { DrawingUploads } from "./use-drawing-uploads";

const schema = z.object({
  name: z
    .string()
    .trim()
    .max(
      DRAWING_NAME_MAX,
      `The drawing name can be at most ${String(DRAWING_NAME_MAX)} characters.`,
    ),
});

type Values = z.infer<typeof schema>;

/** "PDFs, images, DWG and DXF files, up to 100 MB each." */
export const DRAWING_FILES_HINT = `PDFs, images, DWG and DXF files, up to ${formatBytes(maxBytesOf("drawing"))} each.`;

/**
 * Album → Upload drawings: pick or drop files, then Upload; each file
 * becomes a drawing (R1) named after the file, or after the name typed
 * when there is one file. Each shows its own progress, cancel and retry.
 * Closing lets running uploads finish; they show again on reopening.
 */
export function UploadDrawingsDialog({
  open,
  onOpenChange,
  albumId,
  albumName,
  uploads,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  albumId: string;
  albumName: string;
  uploads: DrawingUploads;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });
  const mine = uploads.uploads.filter(
    (upload) => "albumId" in upload.target && upload.target.albumId === albumId,
  );
  const only = chosen.length === 1 ? chosen[0] : undefined;

  const choose = (files: File[]) => {
    if (files.length > 0) setChosen((current) => [...current, ...files]);
  };

  const accept = (event: DragEvent) => {
    if (!event.dataTransfer.types.includes("Files")) return false;
    event.preventDefault();
    return true;
  };

  const start = (values: Values) => {
    const name = only != null && values.name.length > 0 ? values.name : null;
    uploads.add(chosen, {
      target: name == null ? { albumId } : { albumId, name },
    });
    setChosen([]);
    form.reset({ name: "" });
  };

  const close = () => {
    uploads.clearSettled();
    setChosen([]);
    form.reset({ name: "" });
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(start)(event);
          }}
        >
          <DialogHeader className="min-w-0">
            <DialogTitle>Upload drawings</DialogTitle>
            <DialogDescription className="break-words">
              To {albumName}. {DRAWING_FILES_HINT}
            </DialogDescription>
          </DialogHeader>
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
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setDragging(false);
            }}
            onDrop={(event) => {
              setDragging(false);
              if (!accept(event)) return;
              choose(Array.from(event.dataTransfer.files));
            }}
          >
            <Upload
              aria-hidden="true"
              className="text-muted-foreground size-5"
            />
            <p className="text-muted-foreground text-sm">Drop files here, or</p>
            <Input
              ref={input}
              type="file"
              multiple
              accept={acceptOf("drawing")}
              aria-label="Drawing files"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                choose(files);
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

          {chosen.length === 0 ? null : (
            <div className="space-y-3">
              <ul aria-label="Chosen files" className="space-y-1">
                {chosen.map((file, index) => (
                  <li
                    key={`${file.name}-${String(index)}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <DocumentFileIcon
                      fileName={file.name}
                      className="text-muted-foreground size-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatBytes(file.size)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => {
                        setChosen((current) =>
                          current.filter((_, at) => at !== index),
                        );
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
              {only == null ? null : (
                <div className="space-y-1.5">
                  <Label htmlFor="upload-drawing-name">Drawing name</Label>
                  <Input
                    id="upload-drawing-name"
                    placeholder={drawingNameFromFile(only.name)}
                    className="h-10"
                    aria-invalid={form.formState.errors.name != null}
                    {...form.register("name")}
                  />
                  <FieldError message={form.formState.errors.name?.message} />
                  <p className="text-muted-foreground text-xs">
                    Leave it blank to use the file&apos;s name.
                  </p>
                </div>
              )}
              <Button type="submit" className="w-full sm:w-auto">
                <Upload aria-hidden="true" />
                {chosen.length === 1
                  ? "Upload 1 file"
                  : `Upload ${String(chosen.length)} files`}
              </Button>
            </div>
          )}

          {mine.length === 0 ? null : (
            <ul aria-label="Uploads" className="divide-border -my-1 divide-y">
              {mine.map((upload) => (
                <DrawingUploadRow
                  key={upload.id}
                  upload={upload}
                  uploads={uploads}
                />
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
