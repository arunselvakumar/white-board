"use client";

import {
  navigateInApp,
  useCompanyPasswordReset,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { authErrorMessage } from "@/lib/auth-errors";

import { AuthHeading } from "./auth-heading";
import { ResendCode, SixDigitCodeInput, sixDigitCode } from "./code-form";
import { FieldError } from "./field-error";
import { FormAlert } from "./form-alert";
import { PasswordField } from "./password-field";

const emailSchema = z.object({
  email: z.email("Enter a valid email address"),
});

type EmailValues = z.infer<typeof emailSchema>;

const resetSchema = z.object({
  code: sixDigitCode,
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Password is too long"),
});

type ResetValues = z.infer<typeof resetSchema>;

type Step =
  { kind: "email" } | { kind: "reset"; email: string } | { kind: "done" };

const DESCRIPTION: Record<Step["kind"], string> = {
  email: "Enter your email and we'll send you a code.",
  reset: "Enter the code from your email and choose a new password.",
  done: "Your password has been reset. Sign in with your new password.",
};

/**
 * Forgot password: email → emailed 6-digit code + new password → Sign in.
 * Step 1 always moves on, so the screen never reveals whether an email has
 * an account (the server answers the same either way).
 */
export function ForgotPasswordForm() {
  const reset = useCompanyPasswordReset();
  const [step, setStep] = useState<Step>({ kind: "email" });

  return (
    <>
      <AuthHeading
        title="Reset password"
        description={DESCRIPTION[step.kind]}
      />
      {step.kind === "email" ? (
        <EmailStep
          reset={reset}
          onSent={(email) => {
            setStep({ kind: "reset", email });
          }}
        />
      ) : step.kind === "reset" ? (
        <ResetStep
          email={step.email}
          reset={reset}
          onReset={() => {
            setStep({ kind: "done" });
          }}
          onChangeEmail={() => {
            reset.clearError();
            setStep({ kind: "email" });
          }}
        />
      ) : (
        <Button
          type="button"
          className="h-10 w-full"
          onClick={() => {
            navigateInApp("/sign-in");
          }}
        >
          Sign in
        </Button>
      )}
      {step.kind !== "done" && (
        <p className="text-muted-foreground text-center text-sm font-light">
          Remembered it?{" "}
          <Link
            href="/sign-in"
            className="text-primary underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      )}
    </>
  );
}

type PasswordReset = ReturnType<typeof useCompanyPasswordReset>;

function EmailStep({
  reset,
  onSent,
}: {
  reset: PasswordReset;
  onSent: (email: string) => void;
}) {
  const form = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });
  const busy = form.formState.isSubmitting || reset.fetchStatus === "fetching";

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const result = await reset.requestCode(values.email);
          if (result.error == null) onSent(values.email.trim());
        })(event);
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <Input
          id="reset-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.in"
          className="h-10"
          {...form.register("email")}
        />
        <FieldError
          message={
            form.formState.errors.email?.message ??
            authErrorMessage(reset.error, "email")
          }
        />
      </div>
      <FormAlert message={authErrorMessage(reset.error, "global")} />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Sending…" : "Send code"}
      </Button>
    </form>
  );
}

function ResetStep({
  email,
  reset,
  onReset,
  onChangeEmail,
}: {
  email: string;
  reset: PasswordReset;
  onReset: () => void;
  onChangeEmail: () => void;
}) {
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: "", password: "" },
  });
  const busy = form.formState.isSubmitting || reset.fetchStatus === "fetching";

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const result = await reset.resetPassword({ email, ...values });
          if (result.error == null) onReset();
        })(event);
      }}
      className="space-y-4"
      noValidate
    >
      <p className="text-muted-foreground text-sm">
        If <span className="text-foreground font-semibold">{email}</span> has an
        account, we sent it a code.{" "}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm"
          onClick={onChangeEmail}
        >
          Use another email
        </Button>
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="reset-code">Code</Label>
        <Controller
          name="code"
          control={form.control}
          render={({ field }) => (
            <SixDigitCodeInput
              id="reset-code"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <FieldError
          message={
            form.formState.errors.code?.message ??
            authErrorMessage(reset.error, "code")
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-password">New password</Label>
        <PasswordField
          id="reset-password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          {...form.register("password")}
        />
        <FieldError
          message={
            form.formState.errors.password?.message ??
            authErrorMessage(reset.error, "password")
          }
        />
      </div>
      <FormAlert message={authErrorMessage(reset.error, "global")} />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Resetting…" : "Reset password"}
      </Button>
      <ResendCode
        busy={busy}
        onResend={async () => {
          const result = await reset.requestCode(email);
          return result.error == null;
        }}
      />
    </form>
  );
}
