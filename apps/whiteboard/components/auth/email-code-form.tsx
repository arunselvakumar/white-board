"use client";

import { useSignUp } from "@repo/auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { authErrorMessage } from "@/lib/auth-errors";

const codeSchema = z.object({
  code: z
    .string()
    .min(6, "Enter the 6-digit code")
    .max(6, "Enter the 6-digit code"),
});

type CodeValues = z.infer<typeof codeSchema>;

/**
 * Email Verification: the 6-digit code emailed after Sign-up. A correct code
 * verifies the email and signs the User in; `onVerified` then moves on.
 */
export function EmailCodeForm({
  email,
  submitLabel = "Verify email",
  onVerified,
}: {
  email: string;
  submitLabel?: string;
  onVerified: () => void | Promise<void>;
}) {
  const { verifyEmailCode, sendEmailCode, fetchStatus, error } = useSignUp();
  const [resent, setResent] = useState(false);
  const form = useForm<CodeValues>({ resolver: zodResolver(codeSchema) });

  const onSubmit = async (values: CodeValues) => {
    const result = await verifyEmailCode({ email, code: values.code });
    if (result.error == null) await onVerified();
  };

  const resendCode = async () => {
    const result = await sendEmailCode(email);
    if (result.error == null) setResent(true);
  };

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="code">Verification code</Label>
        <Input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          className="h-10 tracking-[0.3em] placeholder:tracking-normal"
          {...form.register("code")}
        />
        <FieldError
          message={
            form.formState.errors.code?.message ??
            authErrorMessage(error, "code")
          }
        />
      </div>

      <FormAlert message={authErrorMessage(error, "global")} />

      <Button
        type="submit"
        disabled={form.formState.isSubmitting || fetchStatus === "fetching"}
        className="mt-4 h-10 w-full"
      >
        {form.formState.isSubmitting ? "Verifying…" : submitLabel}
      </Button>

      <p className="text-muted-foreground text-center text-sm font-light">
        {resent ? (
          <span>Code resent. Check your inbox.</span>
        ) : (
          <>
            Didn&apos;t get the code?{" "}
            <button
              type="button"
              onClick={() => {
                void resendCode();
              }}
              className="text-primary cursor-pointer hover:underline"
            >
              Resend code
            </button>
          </>
        )}
      </p>
    </form>
  );
}
