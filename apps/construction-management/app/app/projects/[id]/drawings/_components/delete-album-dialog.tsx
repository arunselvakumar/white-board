"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useDeleteDrawingAlbum,
  type DrawingAlbum,
} from "@/src/queries/project-drawings";

/**
 * "Delete {album}?" An album with drawings is refused by the server; its
 * message (move or delete them first) stays in the dialog.
 */
export function DeleteAlbumDialog({
  projectId,
  album,
  onClose,
}: {
  projectId: string;
  /** The album to delete; null keeps the dialog closed. */
  album: Pick<DrawingAlbum, "id" | "name"> | null;
  onClose: () => void;
}) {
  const removal = useDeleteDrawingAlbum(projectId);
  // Keep the name on screen while the dialog animates closed.
  const [last, setLast] = useState(album);
  if (album != null && album !== last) setLast(album);
  const shown = album ?? last;
  return (
    <AlertDialog
      open={album != null}
      onOpenChange={(open) => {
        if (!open) {
          removal.reset();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-all">
            Delete {shown?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The album is removed from the Project for everyone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {removal.isError ? (
          <FormAlert message={fieldForCode(removal.error, {}).message} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={removal.isPending}
            onClick={() => {
              if (album == null) return;
              removal.mutate(album.id, {
                onSuccess: () => {
                  removal.reset();
                  onClose();
                },
              });
            }}
          >
            {removal.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
