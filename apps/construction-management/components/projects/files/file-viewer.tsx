"use client";

import { Download, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { DocumentFileIcon } from "../documents/document-file-icon";

/** A stored file as a file route serves it (CM-407). */
export type ViewableFile = {
  name: string;
  /** Our route that streams it; `?download=1` saves it. */
  url: string;
  contentType: string;
};

export function isImageFile(file: { contentType: string }): boolean {
  return file.contentType.startsWith("image/");
}

export function isPdfFile(file: { contentType: string }): boolean {
  return file.contentType === "application/pdf";
}

export function downloadUrl(file: { url: string }): string {
  return `${file.url}?download=1`;
}

/**
 * Shows a stored file (CM-408, CM-410): an image in a lightbox, a PDF in
 * the browser's own viewer (the file route allows framing by our pages
 * only), anything else — DWG, DXF — as a card to download, since browsers
 * cannot draw CAD files.
 */
export function FileViewer({
  file,
  onClose,
  description,
  actions,
}: {
  file: ViewableFile | null;
  onClose: () => void;
  /** A line under the name: revision, size, uploader, date. */
  description?: ReactNode;
  /** Extra footer actions next to Download. */
  actions?: ReactNode;
}) {
  // Kept after closing so the title stays while the dialog animates out.
  const [last, setLast] = useState(file);
  if (file != null && file !== last) setLast(file);
  const shown = file ?? last;
  return (
    <Dialog
      open={file != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-5xl">
        {shown == null ? null : (
          <>
            <DialogHeader className="min-w-0 pr-8">
              <DialogTitle className="truncate" title={shown.name}>
                {shown.name}
              </DialogTitle>
              {description == null ? null : (
                <DialogDescription>{description}</DialogDescription>
              )}
            </DialogHeader>
            {isImageFile(shown) ? (
              // eslint-disable-next-line @next/next/no-img-element -- a private file route: the image optimizer cannot send the Session
              <img
                src={shown.url}
                alt={shown.name}
                className="bg-muted max-h-[70dvh] w-full rounded-md object-contain"
              />
            ) : isPdfFile(shown) ? (
              <iframe
                title={shown.name}
                src={shown.url}
                className="h-[70dvh] w-full rounded-md border"
              />
            ) : (
              <div className="bg-muted/50 flex flex-col items-center gap-3 rounded-lg border px-4 py-10 text-center">
                <span className="bg-background text-muted-foreground flex size-12 items-center justify-center rounded-xl border">
                  <DocumentFileIcon
                    fileName={shown.name}
                    contentType={shown.contentType}
                    className="size-6"
                  />
                </span>
                <p className="font-medium">
                  This file can&apos;t be shown here
                </p>
                <p className="text-muted-foreground max-w-sm text-sm">
                  CAD drawings (DWG, DXF) open in AutoCAD or a free DWG viewer.
                  Download the file to open it.
                </p>
                <a
                  href={downloadUrl(shown)}
                  download={shown.name}
                  className={buttonVariants()}
                >
                  <Download aria-hidden="true" />
                  Download
                </a>
              </div>
            )}
            <DialogFooter className="flex-wrap gap-2">
              {actions}
              {isImageFile(shown) || isPdfFile(shown) ? (
                <>
                  <a
                    href={shown.url}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <ExternalLink aria-hidden="true" />
                    Open in new tab
                  </a>
                  <a
                    href={downloadUrl(shown)}
                    download={shown.name}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <Download aria-hidden="true" />
                    Download
                  </a>
                </>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
