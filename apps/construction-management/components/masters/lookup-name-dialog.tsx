"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
import { useLookupCommand, type LookupItem } from "@/src/queries/masters";

import type { LookupScreenConfig } from "./lookup-screens";

const NAME_MAX = 100;

/** Add a row, or rename a Company-made one (with the `updatedAt` it loaded). */
export function LookupNameDialog({
  config,
  item,
  onClose,
}: {
  config: LookupScreenConfig;
  /** Null to add. */
  item: LookupItem | null;
  onClose: () => void;
}) {
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, `Enter the ${config.singular} name`)
      .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
  });
  type Values = z.infer<typeof schema>;
  const serverFields: Record<string, keyof Values> = {
    [`${config.code}_NAME_REQUIRED`]: "name",
    [`${config.code}_NAME_TOO_LONG`]: "name",
    [`${config.code}_NAME_IN_USE`]: "name",
  };

  const command = useLookupCommand(config.list);
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
              kind: "rename",
              id: item.id,
              name: values.name,
              expectedUpdatedAt: item.updatedAt,
            },
      );
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, serverFields);
      form.setError(field ?? "root", { message });
    }
  });

  const fieldId = `${config.list}-name`;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item == null ? `Add ${config.singular}` : `Rename ${item.name}`}
            </DialogTitle>
            <DialogDescription>{config.dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={fieldId}>{config.singular} name</Label>
            <Input
              id={fieldId}
              className="h-10"
              autoComplete="off"
              placeholder={config.placeholder}
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
            <Button type="submit" disabled={command.isPending}>
              {command.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
