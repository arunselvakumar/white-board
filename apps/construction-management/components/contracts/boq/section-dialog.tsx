"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
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
import { BOQ_SECTION_TITLE_MAX } from "@/src/contracts/domain/boq";
import { useSectionCommand } from "@/src/queries/contracts-boq";

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter the section's title")
    .max(
      BOQ_SECTION_TITLE_MAX,
      `Use at most ${String(BOQ_SECTION_TITLE_MAX)} characters`,
    ),
});

type Values = z.infer<typeof schema>;

/**
 * Add a BOQ section, or rename one (CM-1103). A title the BOQ already has
 * (any case) shows under the field; a stale rename shows the server's
 * message.
 */
export function SectionDialog({
  projectId,
  section,
  onClose,
}: {
  projectId: string;
  /** Null to add. */
  section: { id: string; title: string; updatedAt: string } | null;
  onClose: () => void;
}) {
  const id = useId();
  const command = useSectionCommand();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: section?.title ?? "" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync(
        section == null
          ? { kind: "create", projectId, title: values.title }
          : {
              kind: "rename",
              id: section.id,
              title: values.title,
              expectedUpdatedAt: section.updatedAt,
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        BOQ_SECTION_TITLE_REQUIRED: "title",
        BOQ_SECTION_TITLE_TOO_LONG: "title",
        BOQ_SECTION_TITLE_TAKEN: "title",
      });
      form.setError(field ?? "root", { message });
    }
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-md">
        <form
          noValidate
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">
              {section == null ? "Add section" : `Rename ${section.title}`}
            </DialogTitle>
            <DialogDescription>
              A heading of the BOQ, as the contract prints it. New sections go
              to the end; move them with the arrows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input
              id={`${id}-title`}
              className="h-10"
              autoComplete="off"
              placeholder="Earthwork"
              aria-invalid={errors.title != null}
              {...form.register("title")}
            />
            <FieldError message={errors.title?.message} />
          </div>
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || command.isPending}
            >
              {section == null ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
