"use client";

import { navigateInApp } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
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
import { Textarea } from "@repo/ui/components/textarea";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import { deleteMyAccount, type MyAccountModel } from "@/src/queries/account";
import { QueryHttpError } from "@/src/queries/http";

import { ActionCodeStep } from "./action-code-step";

/** Where an Owner hands over or deletes their Company. */
export const COMPANY_SETTINGS_HREF = "/app/masters/settings/company";

const schema = z.object({
  reason: z.string().trim().max(500, "Keep the reason under 500 characters"),
  confirmation: z
    .string()
    .trim()
    .refine((value) => value === "DELETE", {
      message: "Type DELETE in capital letters",
    }),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  CONFIRMATION_MISMATCH: "confirmation",
  REASON_TOO_LONG: "reason",
  ACTION_CODE_INVALID: "code",
  ACTION_CODE_EXPIRED: "code",
  ACTION_CODE_NOT_FOUND: "code",
  ACTION_CODE_LOCKED: "code",
};

type OwnedCompany = MyAccountModel["ownedCompanies"][number];

/** Why an Owner cannot delete their account yet, and where to go. */
export function OwnerMustHandOver({
  companies,
}: {
  companies: readonly OwnedCompany[];
}) {
  return (
    <div role="alert" className="space-y-3 text-sm">
      <p>
        You own{" "}
        {companies.map((company) => company.name).join(", ") || "a Company"}.
        Before you delete your account, hand each Company to another Team Member
        or delete it.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        <Link
          href={`${COMPANY_SETTINGS_HREF}#transfer-ownership`}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Transfer ownership
        </Link>
        <Link
          href={`${COMPANY_SETTINGS_HREF}#delete-company`}
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Delete Company
        </Link>
      </div>
      <p className="text-muted-foreground">
        These are in Masters → Settings → Company, in each Company you own.
      </p>
    </div>
  );
}

/**
 * Delete My Account (CM-907): a reason, DELETE typed and a code. An Owner
 * is sent to Transfer ownership or Delete Company first. Afterwards the
 * User is signed out.
 */
export function DeleteAccountDialog({
  ownedCompanies,
  onClose,
}: {
  ownedCompanies: readonly OwnedCompany[];
  onClose: () => void;
}) {
  const [owned, setOwned] = useState(ownedCompanies);
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "", confirmation: "", code: "" },
  });
  const mutation = useMutation({ mutationFn: deleteMyAccount });
  const errors = form.formState.errors;

  const submit = async (values: Parsed) => {
    try {
      await mutation.mutateAsync({
        reason: values.reason === "" ? null : values.reason,
        confirmation: values.confirmation,
        code: values.code,
      });
      navigateInApp("/sign-in?account=deleted");
    } catch (error) {
      if (
        error instanceof QueryHttpError &&
        error.code === "OWNER_MUST_HAND_OVER"
      ) {
        const details = error.details as { companies?: OwnedCompany[] };
        setOwned(details.companies ?? [{ id: "", name: "a Company" }]);
        return;
      }
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
        <DialogHeader>
          <DialogTitle>Delete my account</DialogTitle>
          <DialogDescription>
            You leave every Company. Your Team Member records stay with each
            Company, marked Left, and your name shows as Deleted user. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {owned.length > 0 ? (
          <>
            <OwnerMustHandOver companies={owned} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            noValidate
            className="min-w-0 space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit(submit)(event);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="delete-reason">
                Why are you leaving? (optional)
              </Label>
              <Textarea
                id="delete-reason"
                rows={2}
                aria-invalid={errors.reason != null}
                {...form.register("reason")}
              />
              <FieldError message={errors.reason?.message} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirmation" required>
                Type DELETE to confirm
              </Label>
              <Input
                id="delete-confirmation"
                autoComplete="off"
                className="h-10"
                aria-required
                aria-invalid={errors.confirmation != null}
                {...form.register("confirmation")}
              />
              <FieldError message={errors.confirmation?.message} />
            </div>
            <Controller
              name="code"
              control={form.control}
              render={({ field }) => (
                <ActionCodeStep
                  id="delete-account-code"
                  purpose="delete_account"
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
                {mutation.isPending ? "Deleting…" : "Delete my account"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
