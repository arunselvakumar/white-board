"use client";

import { navigateInApp } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Label } from "@repo/ui/components/label";

import { authErrorMessage } from "@/lib/auth-errors";
import { continuePath } from "@/lib/safe-redirect";

import { AuthHeading } from "./auth-heading";
import { FieldError } from "./field-error";
import { FormAlert } from "./form-alert";
import { PasswordField } from "./password-field";
import { useChangePassword } from "./use-password-auth";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter the password you signed in with"),
    newPassword: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(128, "Use at most 128 characters"),
    confirm: z.string().min(1, "Type the new password again"),
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the one you were given",
  })
  .refine((values) => values.confirm === values.newPassword, {
    path: ["confirm"],
    message: "The two passwords do not match",
  });

type Values = z.infer<typeof schema>;

/**
 * The first sign-in after an admin set the password (ADR CM-0029 §8): the
 * Temporary Password, then one of their own. Other devices are signed out;
 * then on to the app.
 */
export function ChangePasswordForm({
  redirectUrl,
}: {
  redirectUrl: string | null;
}) {
  const change = useChangePassword();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });
  const errors = form.formState.errors;
  const busy = form.formState.isSubmitting || change.fetchStatus === "fetching";

  const onSubmit = async (values: Values) => {
    const { error } = await change.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    if (error == null) navigateInApp(continuePath(redirectUrl));
  };

  return (
    <>
      <AuthHeading
        title="Choose your own password"
        description="Your Company admin set the password you signed in with. Replace it with one only you know."
      />
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="current-password" required>
            Current password
          </Label>
          <PasswordField
            id="current-password"
            autoComplete="current-password"
            placeholder="The one you were given"
            aria-required
            {...form.register("currentPassword")}
          />
          <FieldError
            message={
              errors.currentPassword?.message ??
              authErrorMessage(change.error, "currentPassword")
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password" required>
            New password
          </Label>
          <PasswordField
            id="new-password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            aria-required
            aria-describedby="new-password-hint"
            {...form.register("newPassword")}
          />
          <p id="new-password-hint" className="text-muted-foreground text-xs">
            At least 8 characters. You sign in with it from now on.
          </p>
          <FieldError
            message={
              errors.newPassword?.message ??
              authErrorMessage(change.error, "password")
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" required>
            Confirm new password
          </Label>
          <PasswordField
            id="confirm-password"
            autoComplete="new-password"
            aria-required
            {...form.register("confirm")}
          />
          <FieldError message={errors.confirm?.message} />
        </div>
        <FormAlert message={authErrorMessage(change.error, "global")} />
        <Button type="submit" disabled={busy} className="h-10 w-full">
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </form>
    </>
  );
}
