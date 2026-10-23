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
import { useSalesListCommand } from "@/src/queries/sales-settings";
import {
  SALES_LIST_WORDS,
  type SalesListKind,
} from "@/src/sales/domain/sales-lists";
import { SALES_LIMITS } from "@/src/sales/domain/sales-terms";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the name")
    .max(
      SALES_LIMITS.listName,
      `Use at most ${String(SALES_LIMITS.listName)} characters`,
    ),
});

type Values = z.infer<typeof schema>;

/** What each list's dialog says. */
export const SALES_LIST_DIALOG_WORDS: Record<
  SalesListKind,
  { description: string; placeholder: string }
> = {
  funnel_stage: {
    description:
      "A step an inquiry moves through. New stages go to the bottom of the funnel; move them with the arrows.",
    placeholder: "Token paid",
  },
  lead_source: {
    description: "Where an inquiry came from, picked on the inquiry form.",
    placeholder: "Newspaper ad",
  },
  lost_reason: {
    description: "Why an inquiry was lost, picked when it is closed as Lost.",
    placeholder: "Wants ready to move",
  },
};

/**
 * Add a Funnel Stage, Lead Source or Lost Reason, or rename one (CM-1002).
 * A name the Project already has (any case) shows under the field; a
 * stale rename shows the server's message.
 */
export function SalesListDialog({
  projectId,
  list,
  item,
  onClose,
}: {
  projectId: string;
  list: SalesListKind;
  /** Null to add. */
  item: { id: string; name: string; updatedAt: string } | null;
  onClose: () => void;
}) {
  const id = useId();
  const { code, label } = SALES_LIST_WORDS[list];
  const words = SALES_LIST_DIALOG_WORDS[list];
  const command = useSalesListCommand(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name ?? "" },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async (values) => {
    try {
      await command.mutateAsync(
        item == null
          ? { kind: "create", list, name: values.name }
          : {
              kind: "rename",
              list,
              id: item.id,
              name: values.name,
              expectedUpdatedAt: item.updatedAt,
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, {
        [`${code}_NAME_REQUIRED`]: "name",
        [`${code}_NAME_TOO_LONG`]: "name",
        [`${code}_NAME_IN_USE`]: "name",
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
              {item == null ? `Add ${label}` : `Rename ${item.name}`}
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
