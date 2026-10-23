"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  drawingAlbumsQuery,
  useMoveDrawing,
  type DrawingSummary,
} from "@/src/queries/project-drawings";

import { AlbumSelectSkeleton } from "./drawings-skeletons";

const schema = z.object({
  albumId: z.string().min(1, "Choose an album."),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS = { ALBUM_NOT_FOUND: "albumId" } as const;

function MoveDrawingForm({
  projectId,
  drawing,
  onClose,
}: {
  projectId: string;
  drawing: DrawingSummary;
  onClose: () => void;
}) {
  const { data } = useSuspenseQuery(drawingAlbumsQuery(projectId));
  const move = useMoveDrawing(projectId);
  const items = data.items
    .filter((album) => album.id !== drawing.albumId)
    .map((album) => ({ value: album.id, label: album.name }));
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { albumId: "" },
  });
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    try {
      await move.mutateAsync({
        drawingId: drawing.id,
        albumId: values.albumId,
        updatedAt: drawing.updatedAt,
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
      <DialogHeader className="min-w-0">
        <DialogTitle>Move to album</DialogTitle>
        <DialogDescription className="break-words">
          {drawing.name} and all its revisions move together.
        </DialogDescription>
      </DialogHeader>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This Project has no other album. Add one on the Drawings page first.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="move-drawing-album" required>
            Album
          </Label>
          <Controller
            name="albumId"
            control={form.control}
            render={({ field }) => (
              <Select
                items={items}
                value={field.value === "" ? null : field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="move-drawing-album"
                  size="lg"
                  className="w-full min-w-0"
                  aria-required
                  aria-invalid={errors.albumId != null}
                >
                  <SelectValue placeholder="Choose an album" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  aria-label="Albums"
                >
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.albumId?.message} />
        </div>
      )}
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={items.length === 0 || form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? "Moving…" : "Move"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A drawing → Move to album: one of the Project's other albums. */
export function MoveDrawingDialog({
  projectId,
  drawing,
  onClose,
}: {
  projectId: string;
  /** The drawing to move; null keeps the dialog closed. */
  drawing: DrawingSummary | null;
  onClose: () => void;
}) {
  // Kept after closing so the title stays while the dialog animates out.
  const [last, setLast] = useState(drawing);
  if (drawing != null && drawing !== last) setLast(drawing);
  const shown = drawing ?? last;
  return (
    <Dialog
      open={drawing != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {shown == null ? null : (
          <Suspense
            fallback={
              <div className="space-y-4">
                <DialogHeader className="min-w-0">
                  <DialogTitle>Move to album</DialogTitle>
                  <DialogDescription className="break-words">
                    {shown.name} and all its revisions move together.
                  </DialogDescription>
                </DialogHeader>
                <AlbumSelectSkeleton />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="button" disabled>
                    Move
                  </Button>
                </DialogFooter>
              </div>
            }
          >
            <MoveDrawingForm
              key={shown.id}
              projectId={projectId}
              drawing={shown}
              onClose={onClose}
            />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  );
}
