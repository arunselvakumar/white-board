"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { accountQueries, scheduleCompanyDeletion } from "@/src/queries/account";

import { ActionCodeStep } from "./action-code-step";

const schema = z.object({
  companyName: z.string().trim().min(1, "Type the Company's name"),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  COMPANY_NAME_MISMATCH: "companyName",
  ACTION_CODE_INVALID: "code",
  ACTION_CODE_EXPIRED: "code",
  ACTION_CODE_NOT_FOUND: "code",
  ACTION_CODE_LOCKED: "code",
};

/**
 * Delete Company (CM-907, ADR CM-0021 §10): the Owner types the name and
 * enters a code. The Company becomes read-only for 30 days, then
 * everything in it is deleted for good.
 */
export function DeleteCompanyDialog({
  companyName,
  onClose,
}: {
  companyName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: { companyName: "", code: "" },
  });
  const mutation = useMutation({ mutationFn: scheduleCompanyDeletion });
  const errors = form.formState.errors;

  const submit = async (values: Parsed) => {
    try {
      await mutation.mutateAsync(values);
      await queryClient.invalidateQueries({
        queryKey: accountQueries.key.deletion,
      });
      onClose();
    } catch (error) {
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      form.setError(field ?? "root", { message });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid-cols-1 sm:max-w-lg">
        <form
          noValidate
          className="min-w-0 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Delete {companyName}?</DialogTitle>
            <DialogDescription>
              The Company becomes read-only for everyone for 30 days. You can
              cancel during that time. Then every Project, record, file and
              membership is deleted for good; only the subscription invoices are
              kept for GST records.
            </DialogDescription>
          </DialogHeader>
          <p className="bg-muted rounded-md p-3 text-sm">
            Take a full Company backup first (
            <Link href="/app/settings/backup" className="font-medium underline">
              Settings → Backup &amp; export
            </Link>
            ) so you keep a copy of your records.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="delete-company-name" required>
              Type <span className="font-semibold">{companyName}</span> to
              confirm
            </Label>
            <Input
              id="delete-company-name"
              autoComplete="off"
              className="h-10"
              aria-required
              aria-invalid={errors.companyName != null}
              {...form.register("companyName")}
            />
            <FieldError message={errors.companyName?.message} />
          </div>
          <Controller
            name="code"
            control={form.control}
            render={({ field }) => (
              <ActionCodeStep
                id="delete-company-code"
                purpose="delete_company"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.code?.message}
              />
            )}
          />
          <FormAlert message={errors.root?.message} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Scheduling…" : "Delete Company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
