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
import {
  useDepartmentCommand,
  type DepartmentItem,
} from "@/src/queries/departments";

const NAME_MAX = 100;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the Department name")
    .max(NAME_MAX, `Use at most ${String(NAME_MAX)} characters`),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  DEPARTMENT_NAME_REQUIRED: "name",
  DEPARTMENT_NAME_TOO_LONG: "name",
  DEPARTMENT_NAME_TAKEN: "name",
};

/**
 * Add a department, or rename a Company-made one with the `updatedAt` it
 * loaded (ADR CM-0049 §4).
 */
export function DepartmentNameDialog({
  item,
  onClose,
}: {
  /** Null to add. */
  item: DepartmentItem | null;
  onClose: () => void;
}) {
  const command = useDepartmentCommand();
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
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
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
              {item == null ? "Add Department" : `Rename ${item.name}`}
            </DialogTitle>
            <DialogDescription>
              A department of your Company, like Accounts or Purchase.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="department-name" required>
              Department name
            </Label>
            <Input
              id="department-name"
              className="h-10"
              autoComplete="off"
              aria-required
              placeholder="Accounts"
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
