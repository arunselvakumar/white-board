"use client";

import { Upload } from "lucide-react";
import { useRef, useState } from "react";
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

import { acceptOf } from "@/lib/project-uploads";
import { revisionLabel } from "@/src/projects/domain/drawing";
import type { DrawingSummary } from "@/src/queries/project-drawings";

import { DrawingUploadRow } from "./drawing-upload-row";
import { DRAWING_FILES_HINT } from "./upload-drawings-dialog";
import type { DrawingUploads } from "./use-drawing-uploads";

/**
 * A drawing → Upload new revision: one file becomes the next revision
 * (R3 → R4) and the one shown; older revisions stay in the history.
 * Closing lets a running upload finish.
 */
export function UploadRevisionDialog({
  drawing,
  onClose,
  uploads,
}: {
  /** The drawing to add a revision to; null keeps the dialog closed. */
  drawing: DrawingSummary | null;
  onClose: () => void;
  uploads: DrawingUploads;
}) {
  const input = useRef<HTMLInputElement>(null);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(drawing);
  if (drawing != null && drawing !== last) setLast(drawing);
  const shown = drawing ?? last;
  const mine = uploads.uploads.filter(
    (upload) =>
      "drawingId" in upload.target && upload.target.drawingId === shown?.id,
  );
  const running = mine.some((upload) => upload.state === "uploading");

  const close = () => {
    uploads.clearSettled();
    onClose();
  };

  return (
    <Dialog
      open={drawing != null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="min-w-0">
          <DialogTitle>Upload new revision</DialogTitle>
          <DialogDescription className="break-words">
            {shown == null
              ? null
              : `${shown.name} is at ${shown.latest.label}. The new file becomes ${revisionLabel(shown.latest.revision + 1)}; ${shown.latest.label} stays in the history.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center">
          <p className="text-muted-foreground text-sm">{DRAWING_FILES_HINT}</p>
          <Input
            ref={input}
            type="file"
            accept={acceptOf("drawing")}
            aria-label="Revision file"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file != null && shown != null)
                uploads.add([file], { target: { drawingId: shown.id } });
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden="true" />
            Choose file
          </Button>
        </div>
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
      </DialogContent>
    </Dialog>
  );
}
