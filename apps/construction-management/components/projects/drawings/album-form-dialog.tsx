"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
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
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { ALBUM_NAME_MAX } from "@/src/projects/domain/drawing";
import {
  useAddDrawingAlbum,
  useRenameDrawingAlbum,
  type DrawingAlbum,
} from "@/src/queries/project-drawings";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the album name.")
    .max(
      ALBUM_NAME_MAX,
      `The album name can be at most ${String(ALBUM_NAME_MAX)} characters.`,
    ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS = {
  ALBUM_NAME_IN_USE: "name",
  ALBUM_NAME_REQUIRED: "name",
  ALBUM_NAME_TOO_LONG: "name",
} as const;

function AlbumForm({
  projectId,
  album,
  onClose,
}: {
  projectId: string;
  album: DrawingAlbum | null;
  onClose: () => void;
}) {
  const add = useAddDrawingAlbum(projectId);
  const rename = useRenameDrawingAlbum(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: album?.name ?? "" },
  });
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    try {
      if (album == null) await add.mutateAsync(values.name);
      else
        await rename.mutateAsync({
          albumId: album.id,
          name: values.name,
          updatedAt: album.updatedAt,
        });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {album == null ? "Add album" : "Rename album"}
        </DialogTitle>
        <DialogDescription>
          {album == null
            ? "A folder for one kind of drawing, such as Interior or Landscape."
            : "The drawings in it stay where they are."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="album-name">Album name</Label>
        <Input
          id="album-name"
          className="h-10"
          autoComplete="off"
          aria-invalid={errors.name != null}
          {...form.register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? "Saving…"
            : album == null
              ? "Add album"
              : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Drawings → Add album, or an album → Rename: one name, at most 80
 * characters, not already used on the Project.
 */
export function AlbumFormDialog({
  projectId,
  album,
  onClose,
}: {
  projectId: string;
  /** "new" to add an album, an album to rename it; null keeps it closed. */
  album: DrawingAlbum | "new" | null;
  onClose: () => void;
}) {
  // Keep the title on screen while the dialog animates closed.
  const [last, setLast] = useState(album);
  if (album != null && album !== last) setLast(album);
  const shown = album ?? last;
  return (
    <Dialog
      open={album != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {shown == null ? null : (
          <AlbumForm
            key={shown === "new" ? "new" : shown.id}
            projectId={projectId}
            album={shown === "new" ? null : shown}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
