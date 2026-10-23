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
import { MASTER_NAME_MAX } from "@/src/masters/domain/master-kind";
import {
  useTrackingMasterCommand,
  type TrackingMasterList,
} from "@/src/queries/tracking-masters";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the name")
    .max(MASTER_NAME_MAX, `Use at most ${String(MASTER_NAME_MAX)} characters`),
});

type Values = z.infer<typeof schema>;

/** Add or rename dialog words for each list. */
export const TRACKING_MASTER_DIALOG_WORDS: Record<
  TrackingMasterList,
  { singular: string; description: string; placeholder: string; code: string }
> = {
  "issue-categories": {
    singular: "Issue Category",
    description: "Picked on Issues & Snags to say what an issue is about.",
    placeholder: "Waterproofing",
    code: "ISSUE_CATEGORY",
  },
  tags: {
    singular: "Tag",
    description: "Put on Tasks to find and filter them.",
    placeholder: "Critical path",
    code: "TAG",
  },
};

/**
 * Add an Issue Category or a Tag, or rename one (a Default category too).
 * A taken name shows under the field; a stale rename shows the server's
 * message.
 */
export function TrackingMasterDialog({
  list,
  item,
  onClose,
}: {
  list: TrackingMasterList;
  /** Null to add. */
  item: { id: string; name: string; updatedAt: string } | null;
  onClose: () => void;
}) {
  const id = useId();
  const words = TRACKING_MASTER_DIALOG_WORDS[list];
  const command = useTrackingMasterCommand(list);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name ?? "" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync(
        item == null
          ? { kind: "create", name: values.name }
          : {
              kind: "update",
              id: item.id,
              name: values.name,
              expectedUpdatedAt: item.updatedAt,
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        [`${words.code}_NAME_REQUIRED`]: "name",
        [`${words.code}_NAME_TOO_LONG`]: "name",
        [`${words.code}_NAME_IN_USE`]: "name",
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
              {item == null ? `Add ${words.singular}` : `Rename ${item.name}`}
            </DialogTitle>
            <DialogDescription>{words.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`} required>
              Name
            </Label>
            <Input
              id={`${id}-name`}
              className="h-10"
              autoComplete="off"
              aria-required
              placeholder={words.placeholder}
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
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || command.isPending}
            >
              {item == null ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
