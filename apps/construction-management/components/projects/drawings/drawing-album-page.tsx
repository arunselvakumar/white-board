"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Eye,
  FileStack,
  FileUp,
  FolderInput,
  History,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { documentMeta } from "@/lib/project-documents";
import {
  drawingAlbumQuery,
  type DrawingRevision,
  type DrawingSummary,
} from "@/src/queries/project-drawings";

import { FileThumbnail } from "../files/file-thumbnail";
import { downloadUrl, FileViewer } from "../files/file-viewer";
import { DeleteDrawingDialog } from "./delete-drawing-dialog";
import { DrawingHistorySheet } from "./drawing-history-sheet";
import { drawingCount, drawingsHref } from "./drawings-page";
import { MoveDrawingDialog } from "./move-drawing-dialog";
import { RenameDrawingDialog } from "./rename-drawing-dialog";
import {
  DRAWING_FILES_HINT,
  UploadDrawingsDialog,
} from "./upload-drawings-dialog";
import { UploadRevisionDialog } from "./upload-revision-dialog";
import { useDrawingUploads } from "./use-drawing-uploads";

type Action = "revision" | "history" | "rename" | "move" | "delete";

function DrawingRow({
  drawing,
  canUpdate,
  canDelete,
  onView,
  onAction,
}: {
  drawing: DrawingSummary;
  canUpdate: boolean;
  canDelete: boolean;
  onView: (drawing: DrawingSummary) => void;
  onAction: (action: Action, drawing: DrawingSummary) => void;
}) {
  const { name, latest } = drawing;
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <FileThumbnail
        file={{
          name: latest.fileName,
          url: latest.url,
          contentType: latest.contentType,
          thumbUrl: latest.thumbUrl,
        }}
        className="size-12 shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium" title={name}>
            {name}
          </p>
          <Badge variant="secondary" className="shrink-0 tabular-nums">
            {latest.label}
          </Badge>
        </div>
        <p className="text-muted-foreground truncate text-xs">
          {documentMeta(latest)}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-1 sm:flex">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`View ${name}`}
          onClick={() => {
            onView(drawing);
          }}
        >
          <Eye aria-hidden="true" />
          View
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`History of ${name}`}
          onClick={() => {
            onAction("history", drawing);
          }}
        >
          <History aria-hidden="true" />
          History
        </Button>
      </div>
      <div className="shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => {
                onView(drawing);
              }}
            >
              <Eye aria-hidden="true" />
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              className="sm:hidden"
              onClick={() => {
                onAction("history", drawing);
              }}
            >
              <History aria-hidden="true" />
              History
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <a href={downloadUrl(latest)} download={latest.fileName} />
              }
            >
              <Download aria-hidden="true" />
              Download
            </DropdownMenuItem>
            {canUpdate ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    onAction("revision", drawing);
                  }}
                >
                  <FileUp aria-hidden="true" />
                  Upload new revision
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("rename", drawing);
                  }}
                >
                  <Pencil aria-hidden="true" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    onAction("move", drawing);
                  }}
                >
                  <FolderInput aria-hidden="true" />
                  Move to album
                </DropdownMenuItem>
              </>
            ) : null}
            {canDelete ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    onAction("delete", drawing);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/**
 * An album of the Project's Drawings (CM-408): each drawing with its
 * latest revision (R3), to view, download or look back through its
 * history. Upload drawings follows the Drawings menu's Create flag; a new
 * revision, Rename and Move follow Update; Delete follows Delete.
 */
export function DrawingAlbumPage({
  projectId,
  albumId,
  canCreate,
  canUpdate,
  canDelete,
}: {
  projectId: string;
  albumId: string;
  /** Upload drawings. */
  canCreate: boolean;
  /** Upload new revision, Rename, Move to album. */
  canUpdate: boolean;
  /** Delete a drawing. */
  canDelete: boolean;
}) {
  const { data } = useSuspenseQuery(drawingAlbumQuery(projectId, albumId));
  const { album, drawings } = data;
  const drawingUploads = useDrawingUploads(projectId);
  const revisionUploads = useDrawingUploads(projectId);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState<{ action: Action; id: string } | null>(null);
  // The history's drawing may leave the album (moved) while it is open.
  const [historyOf, setHistoryOf] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [viewing, setViewing] = useState<{
    drawingName: string;
    revision: DrawingRevision;
  } | null>(null);

  // Dialogs read the drawing fresh, so a refetch shows its latest revision
  // and a drawing moved or deleted elsewhere closes them.
  const target = (action: Action) =>
    open?.action === action
      ? (drawings.find((drawing) => drawing.id === open.id) ?? null)
      : null;
  const close = () => {
    setOpen(null);
  };

  const onAction = (action: Action, drawing: DrawingSummary) => {
    if (action === "history")
      setHistoryOf({ id: drawing.id, name: drawing.name });
    else setOpen({ action, id: drawing.id });
  };

  const uploadButton = (
    <Button
      type="button"
      onClick={() => {
        setUploading(true);
      }}
    >
      <Upload aria-hidden="true" />
      Upload drawings
    </Button>
  );

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="space-y-2">
        <Link
          href={drawingsHref(projectId)}
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "-ml-2",
          })}
        >
          <ArrowLeft aria-hidden="true" />
          Drawings
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="min-w-0 font-semibold break-words">{album.name}</h2>
            {drawings.length > 0 ? (
              <p className="text-muted-foreground text-sm tabular-nums">
                {drawingCount(drawings.length)}
              </p>
            ) : null}
          </div>
          {canCreate && drawings.length > 0 ? uploadButton : null}
        </div>
      </div>

      {drawings.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileStack />
            </EmptyMedia>
            <EmptyTitle>
              {canCreate
                ? `Upload the ${album.name} drawings`
                : "No drawings in this album yet"}
            </EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? DRAWING_FILES_HINT
                : "Drawings uploaded to this album show here."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? <EmptyContent>{uploadButton}</EmptyContent> : null}
        </Empty>
      ) : (
        <>
          <ul
            aria-label="Drawings"
            className="divide-border bg-card divide-y rounded-lg border"
          >
            {drawings.map((drawing) => (
              <DrawingRow
                key={drawing.id}
                drawing={drawing}
                canUpdate={canUpdate}
                canDelete={canDelete}
                onView={(shown) => {
                  setViewing({
                    drawingName: shown.name,
                    revision: shown.latest,
                  });
                }}
                onAction={onAction}
              />
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Files aren&apos;t scanned. Only open files from people you trust.
          </p>
        </>
      )}

      <FileViewer
        file={
          viewing == null
            ? null
            : {
                name: viewing.revision.fileName,
                url: viewing.revision.url,
                contentType: viewing.revision.contentType,
              }
        }
        description={
          viewing == null
            ? null
            : `${viewing.drawingName} · ${viewing.revision.label} · ${documentMeta(viewing.revision)}`
        }
        onClose={() => {
          setViewing(null);
        }}
      />
      <DrawingHistorySheet
        projectId={projectId}
        drawing={historyOf}
        onClose={() => {
          setHistoryOf(null);
        }}
        onView={(revision) => {
          if (historyOf != null)
            setViewing({ drawingName: historyOf.name, revision });
        }}
      />

      {canCreate ? (
        <UploadDrawingsDialog
          open={uploading}
          onOpenChange={setUploading}
          albumId={album.id}
          albumName={album.name}
          uploads={drawingUploads}
        />
      ) : null}
      {canUpdate ? (
        <>
          <UploadRevisionDialog
            drawing={target("revision")}
            onClose={close}
            uploads={revisionUploads}
          />
          <RenameDrawingDialog
            projectId={projectId}
            drawing={target("rename")}
            onClose={close}
          />
          <MoveDrawingDialog
            projectId={projectId}
            drawing={target("move")}
            onClose={close}
          />
        </>
      ) : null}
      {canDelete ? (
        <DeleteDrawingDialog
          projectId={projectId}
          drawing={target("delete")}
          onClose={close}
        />
      ) : null}
    </div>
  );
}
