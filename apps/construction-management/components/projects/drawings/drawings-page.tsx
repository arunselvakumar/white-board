"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

import {
  drawingAlbumsQuery,
  type DrawingAlbum,
} from "@/src/queries/project-drawings";

import { AlbumFormDialog } from "./album-form-dialog";
import { DeleteAlbumDialog } from "./delete-album-dialog";

/** "No drawings", "1 drawing", "3 drawings". */
export function drawingCount(count: number): string {
  if (count === 0) return "No drawings";
  return count === 1 ? "1 drawing" : `${String(count)} drawings`;
}

/** `/app/projects/{id}/drawings`, or an album's page under it. */
export function drawingsHref(projectId: string, albumId?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/drawings`;
  return albumId == null ? base : `${base}/${encodeURIComponent(albumId)}`;
}

function AlbumCard({
  projectId,
  album,
  canUpdate,
  canDelete,
  onRename,
  onDelete,
}: {
  projectId: string;
  album: DrawingAlbum;
  canUpdate: boolean;
  canDelete: boolean;
  onRename: (album: DrawingAlbum) => void;
  onDelete: (album: DrawingAlbum) => void;
}) {
  return (
    <li className="bg-card hover:bg-muted/40 relative flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors">
      <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Folder aria-hidden="true" className="size-5" />
      </span>
      <Link
        href={drawingsHref(projectId, album.id)}
        className="focus-visible:ring-ring min-w-0 flex-1 rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:ring-2"
      >
        <span className="block truncate text-sm font-medium" title={album.name}>
          {album.name}
        </span>
        <span className="text-muted-foreground block text-xs tabular-nums">
          {drawingCount(album.drawingCount)}
        </span>
      </Link>
      {canUpdate || canDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="relative z-10 shrink-0"
                aria-label={`Actions for ${album.name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate ? (
              <DropdownMenuItem
                onClick={() => {
                  onRename(album);
                }}
              >
                <Pencil aria-hidden="true" />
                Rename
              </DropdownMenuItem>
            ) : null}
            {canDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  onDelete(album);
                }}
              >
                <Trash2 aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  );
}

/**
 * The Project's Drawings (CM-408): its albums — Architect, Electrical,
 * Plumbing, Structural Drawing and any the Company added — each with how
 * many drawings it holds. Add, Rename and Delete follow the Drawings
 * menu's Create, Update and Delete flags.
 */
export function DrawingsPage({
  projectId,
  canCreate,
  canUpdate,
  canDelete,
}: {
  projectId: string;
  /** Add album. */
  canCreate: boolean;
  /** Rename an album. */
  canUpdate: boolean;
  /** Delete an album. */
  canDelete: boolean;
}) {
  const { data } = useSuspenseQuery(drawingAlbumsQuery(projectId));
  const [editing, setEditing] = useState<DrawingAlbum | "new" | null>(null);
  const [deleting, setDeleting] = useState<DrawingAlbum | null>(null);
  const albums = data.items;
  const total = albums.reduce((sum, album) => sum + album.drawingCount, 0);

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <FolderPlus aria-hidden="true" />
      Add album
    </Button>
  );

  return (
    <div className="w-full max-w-5xl space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold">Drawings</h2>
          {albums.length > 0 ? (
            <p className="text-muted-foreground text-sm tabular-nums">
              {albums.length === 1
                ? "1 album"
                : `${String(albums.length)} albums`}{" "}
              · {total === 1 ? "1 drawing" : `${String(total)} drawings`}
            </p>
          ) : null}
        </div>
        {canCreate && albums.length > 0 ? addButton : null}
      </div>

      {albums.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Folder />
            </EmptyMedia>
            <EmptyTitle>No albums on this Project</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Add an album for each kind of drawing — Architect, Electrical, Plumbing — then upload the sheets into it."
                : "Albums of drawings kept on this Project show here."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? <EmptyContent>{addButton}</EmptyContent> : null}
        </Empty>
      ) : (
        <ul
          aria-label="Albums"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {albums.map((album) => (
            <AlbumCard
              key={album.id}
              projectId={projectId}
              album={album}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onRename={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </ul>
      )}

      {canCreate || canUpdate ? (
        <AlbumFormDialog
          projectId={projectId}
          album={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {canDelete ? (
        <DeleteAlbumDialog
          projectId={projectId}
          album={deleting}
          onClose={() => {
            setDeleting(null);
          }}
        />
      ) : null}
    </div>
  );
}
