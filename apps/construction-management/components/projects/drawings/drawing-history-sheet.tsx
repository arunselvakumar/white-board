"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Download, Eye } from "lucide-react";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Skeleton } from "@repo/ui/components/skeleton";

import { documentMeta } from "@/lib/project-documents";
import {
  drawingQuery,
  type DrawingRevision,
} from "@/src/queries/project-drawings";

import { downloadUrl } from "../files/file-viewer";

function Revisions({
  projectId,
  drawingId,
  onView,
}: {
  projectId: string;
  drawingId: string;
  onView: (revision: DrawingRevision) => void;
}) {
  const { data } = useSuspenseQuery(drawingQuery(projectId, drawingId));
  return (
    <ol aria-label="Revisions" className="space-y-2">
      {data.revisions.map((revision, index) => (
        <li
          key={revision.id}
          aria-label={revision.label}
          className="space-y-2 rounded-lg border px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant={index === 0 ? "default" : "secondary"}>
              {revision.label}
            </Badge>
            <p
              className="min-w-0 flex-1 truncate text-sm font-medium"
              title={revision.fileName}
            >
              {revision.fileName}
            </p>
            {index === 0 ? (
              <span className="text-muted-foreground shrink-0 text-xs">
                Shown
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground text-xs">
            {documentMeta(revision)}
          </p>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`View ${revision.label}`}
              onClick={() => {
                onView(revision);
              }}
            >
              <Eye aria-hidden="true" />
              View
            </Button>
            <a
              href={downloadUrl(revision)}
              download={revision.fileName}
              aria-label={`Download ${revision.label}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download aria-hidden="true" />
              Download
            </a>
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * A drawing's History (CM-408): every revision, newest first, each with
 * its size, uploader and date, to view or download. The newest is the
 * one the album shows.
 */
export function DrawingHistorySheet({
  projectId,
  drawing,
  onClose,
  onView,
}: {
  projectId: string;
  /** The drawing whose history to show; null keeps the sheet closed. */
  drawing: { id: string; name: string } | null;
  onClose: () => void;
  onView: (revision: DrawingRevision) => void;
}) {
  // Keep the list on screen while the sheet slides closed.
  const [last, setLast] = useState(drawing);
  if (drawing != null && drawing !== last) setLast(drawing);
  const shown = drawing ?? last;
  return (
    <Sheet
      open={drawing != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="min-w-0 pr-10">
          <SheetTitle>History</SheetTitle>
          <SheetDescription className="truncate" title={shown?.name}>
            {shown?.name}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {shown == null ? null : (
            <Suspense
              fallback={
                <div className="space-y-2">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              }
            >
              <Revisions
                projectId={projectId}
                drawingId={shown.id}
                onView={onView}
              />
            </Suspense>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
