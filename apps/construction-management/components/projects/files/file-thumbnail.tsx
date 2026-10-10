"use client";

import { useState } from "react";
import { cn } from "@repo/ui/lib/utils";

import { DocumentFileIcon } from "../documents/document-file-icon";
import { isImageFile } from "./file-viewer";

/**
 * A square preview of a stored file (CM-407, CM-410): the browser-made
 * WebP thumbnail when there is one, else the image itself, else an icon
 * for the file's type (PDF, DWG …). An image that fails to load falls back
 * to the icon, so a tile is never broken.
 */
export function FileThumbnail({
  file,
  className,
}: {
  file: {
    name: string;
    url: string;
    contentType: string;
    thumbUrl: string | null;
  };
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = file.thumbUrl ?? (isImageFile(file) ? file.url : null);
  return (
    <span
      className={cn(
        "bg-muted text-muted-foreground relative flex aspect-square items-center justify-center overflow-hidden rounded-md",
        className,
      )}
    >
      {src != null && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private file route: the image optimizer cannot send the Session
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        <DocumentFileIcon
          fileName={file.name}
          contentType={file.contentType}
          className="size-1/3 max-h-10 max-w-10"
        />
      )}
    </span>
  );
}
