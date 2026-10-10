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
import {
  useAddTestingItem,
  useRenameTestingItem,
  type TestingItem,
} from "@/src/queries/project-testing-reports";

const NAME_MAX = 80;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the testing material name.")
    .max(
      NAME_MAX,
      `The testing material name can be at most ${String(NAME_MAX)} characters.`,
    ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, "name"> = {
  TESTING_ITEM_NAME_IN_USE: "name",
  TESTING_ITEM_NAME_REQUIRED: "name",
  TESTING_ITEM_NAME_TOO_LONG: "name",
};

function ItemForm({
  projectId,
  item,
  onDone,
}: {
  projectId: string;
  item: TestingItem | null;
  onDone: () => void;
}) {
  const add = useAddTestingItem(projectId);
  const rename = useRenameTestingItem(projectId);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name ?? "" },
  });
  const errors = form.formState.errors;
  const pending = add.isPending || rename.isPending;

  const submit = async (values: Values) => {
    try {
      if (item == null) await add.mutateAsync(values.name);
      else
        await rename.mutateAsync({
          itemId: item.id,
          name: values.name,
          updatedAt: item.updatedAt,
        });
      onDone();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit(submit)(event);
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {item == null ? "Add testing material" : "Rename testing material"}
        </DialogTitle>
        <DialogDescription>
          {item == null
            ? "A material you send to the lab, such as Sand or Aggregate."
            : "Its reports stay with it."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="testing-item-name">Name</Label>
        <Input
          id="testing-item-name"
          className="h-10"
          autoComplete="off"
          maxLength={NAME_MAX}
          aria-invalid={errors.name != null}
          {...form.register("name")}
        />
        <FieldError message={errors.name?.message} />
      </div>
      <FormAlert message={errors.root?.message} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : item == null ? "Add" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Add a testing material, or rename one (with the `updatedAt` it was
 * loaded with, so a rename by someone else is not overwritten).
 */
export function TestingItemDialog({
  projectId,
  open,
  item,
  onClose,
}: {
  projectId: string;
  open: boolean;
  /** The material to rename; null to add one. */
  item: TestingItem | null;
  onClose: () => void;
}) {
  // Keep the form on screen while the dialog fades closed.
  const [last, setLast] = useState(item);
  if (open && item !== last) setLast(item);
  const shown = open ? item : last;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <ItemForm
          key={shown?.id ?? "new"}
          projectId={projectId}
          item={shown}
          onDone={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
