"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
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

/**
 * One name in a dialog: rename a floor or unit, add or rename a Phase.
 * `check` answers a message for a name the screen refuses (taken, say);
 * `onSave` may throw to keep the dialog open with its message.
 */
export function NameDialog({
  title,
  description,
  label,
  initial,
  max,
  placeholder,
  submitLabel = "Save",
  pending = false,
  check,
  onSave,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  label: string;
  initial: string;
  max: number;
  placeholder?: string;
  submitLabel?: string;
  pending?: boolean;
  check?: (name: string) => string | null;
  onSave: (name: string) => void | Promise<void>;
  onClose: () => void;
  /** More fields below the name (Add Floor's position). */
  children?: ReactNode;
}) {
  const schema = z.object({
    name: z
      .string()
      .trim()
      .min(1, `Enter the ${label.toLowerCase()}`)
      .max(max, `Use at most ${String(max)} characters`),
  });
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: initial },
  });
  const errors = form.formState.errors;

  const submit = form.handleSubmit(async ({ name }) => {
    const problem = check?.(name) ?? null;
    if (problem != null) {
      form.setError("name", { message: problem });
      return;
    }
    try {
      await onSave(name);
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.",
      });
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
            // Rendered inside Edit Wing's form: keep the submit to this one.
            event.stopPropagation();
            void submit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="break-words">{title}</DialogTitle>
            {description == null ? null : (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="structure-name">{label}</Label>
            <Input
              id="structure-name"
              className="h-10"
              autoComplete="off"
              placeholder={placeholder}
              aria-invalid={errors.name != null}
              {...form.register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          {children}
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
