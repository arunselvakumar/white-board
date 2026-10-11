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
import { PAYMENT_CATEGORY_NAME_MAX } from "@/src/finance/domain/payment-category";
import {
  usePaymentCategoryCommand,
  type PaymentCategoryItem,
} from "@/src/queries/finance-payment-categories";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the category's name")
    .max(
      PAYMENT_CATEGORY_NAME_MAX,
      `Use at most ${String(PAYMENT_CATEGORY_NAME_MAX)} characters`,
    ),
});

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  PAYMENT_CATEGORY_NAME_REQUIRED: "name",
  PAYMENT_CATEGORY_NAME_TOO_LONG: "name",
  PAYMENT_CATEGORY_NAME_TAKEN: "name",
};

/**
 * Add a Payment Category or rename one (a Default one too). A stale
 * rename (someone else changed it) shows the server's message.
 */
export function PaymentCategoryDialog({
  item,
  onClose,
}: {
  /** Null to add. */
  item: PaymentCategoryItem | null;
  onClose: () => void;
}) {
  const id = useId();
  const command = usePaymentCategoryCommand();
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
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {item == null ? "Add Payment Category" : `Rename ${item.name}`}
            </DialogTitle>
            <DialogDescription>
              Picked on Transactions, petty-cash vouchers, Other Expenses and
              payments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              className="h-10"
              autoComplete="off"
              placeholder="Diesel"
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
              {item == null ? "Add" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
