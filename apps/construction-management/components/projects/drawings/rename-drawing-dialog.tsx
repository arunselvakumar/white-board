"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { DRAWING_NAME_MAX } from "@/src/projects/domain/drawing";
import {
  useRenameDrawing,
  type DrawingSummary,
} from "@/src/queries/project-drawings";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the drawing name.")
    .max(
      DRAWING_NAME_MAX,
      `The drawing name can be at most ${String(DRAWING_NAME_MAX)} characters.`,
    ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS = {
  DRAWING_NAME_REQUIRED: "name",
  DRAWING_NAME_TOO_LONG: "name",
} as const;

function RenameDrawingForm({
  projectId,
  drawing,
  onClose,
}: {
  projectId: string;
  drawing: DrawingSummary;
  onClose: () => void;
}) {
  const rename = useRenameDrawing(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: drawing.name },
  });
  const errors = form.formState.errors;

  const submit = async (values: Values) => {
    try {
      await rename.mutateAsync({
        drawingId: drawing.id,
        name: values.name,
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
      <DialogHeader>
        <DialogTitle>Rename drawing</DialogTitle>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="rename-drawing-name">Drawing name</Label>
        <Input
          id="rename-drawing-name"
          className="h-10"
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
          {form.formState.isSubmitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** A drawing → Rename. Someone else's change in between shows its message. */
export function RenameDrawingDialog({
  projectId,
  drawing,
  onClose,
}: {
  projectId: string;
  /** The drawing to rename; null keeps the dialog closed. */
  drawing: DrawingSummary | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={drawing != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {drawing == null ? null : (
          <RenameDrawingForm
            key={drawing.id}
            projectId={projectId}
            drawing={drawing}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
