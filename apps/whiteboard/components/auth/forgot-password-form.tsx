"use client";

import {
  navigateInApp,
  useAuth,
  usePasswordReset,
  useSignIn,
} from "@repo/auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { PasswordField } from "@/components/auth/password-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { workspaceEntryPath } from "@/lib/workspace-entry";

const requestSchema = z.object({
  email: z.email("Enter a valid email address"),
});

type RequestValues = z.infer<typeof requestSchema>;

const resetSchema = z.object({
  code: z
    .string()
    .min(6, "Enter the 6-digit code")
    .max(6, "Enter the 6-digit code"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

type ResetValues = z.infer<typeof resetSchema>;

/**
 * The Password Reset Flow: email → emailed code and a new password. A reset
 * signs out every Session, then signs this browser in with the new password.
 */
export function ForgotPasswordForm() {
  const { isSignedIn } = useAuth();
  const passwordReset = usePasswordReset();
  const signIn = useSignIn();
  const [email, setEmail] = useState<string | null>(null);
  const step = email == null ? "request" : "reset";
  const entryPath = workspaceEntryPath("/");
  const fetchStatus =
    passwordReset.fetchStatus === "fetching" ||
    signIn.fetchStatus === "fetching"
      ? "fetching"
      : "idle";
  const error = passwordReset.error ?? signIn.error;

  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
  });
  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
  });

  useEffect(() => {
    if (isSignedIn) navigateInApp(entryPath);
  }, [entryPath, isSignedIn]);

  const onSubmitRequest = async (values: RequestValues) => {
    const { error: sendError } = await passwordReset.sendCode(values.email);
    if (sendError == null) setEmail(values.email.trim());
  };

  const onSubmitReset = async (values: ResetValues) => {
    if (email == null) return;
    const { error: resetError } = await passwordReset.reset({
      email,
      code: values.code,
      password: values.password,
    });
    if (resetError != null) return;
    const { error: signInError } = await signIn.password({
      identifier: email,
      password: values.password,
    });
    navigateInApp(signInError == null ? entryPath : "/login");
  };

  if (isSignedIn) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title="Reset your password"
        description={
          step === "request"
            ? "We'll email you a reset code"
            : "Enter the code and choose a new password"
        }
      />

      {step === "request" ? (
        <form
          key="request"
          onSubmit={(event) => {
            void requestForm.handleSubmit(onSubmitRequest)(event);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="Enter your email"
              className="h-10"
              {...requestForm.register("email")}
            />
            <FieldError
              message={
                requestForm.formState.errors.email?.message ??
                authErrorMessage(error, "email")
              }
            />
          </div>

          <FormAlert message={authErrorMessage(error, "global")} />

          <Button
            type="submit"
            disabled={
              requestForm.formState.isSubmitting || fetchStatus === "fetching"
            }
            className="mt-4 h-10 w-full"
          >
            {requestForm.formState.isSubmitting
              ? "Sending…"
              : "Send reset code"}
          </Button>
        </form>
      ) : (
        <form
          key="reset"
          onSubmit={(event) => {
            void resetForm.handleSubmit(onSubmitReset)(event);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">Reset code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              className="h-10 tracking-[0.3em] placeholder:tracking-normal"
              {...resetForm.register("code")}
            />
            <FieldError
              message={
                resetForm.formState.errors.code?.message ??
                authErrorMessage(error, "code")
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <PasswordField
              id="password"
              autoComplete="new-password"
              placeholder="Choose a new password"
              {...resetForm.register("password")}
            />
            <FieldError
              message={
                resetForm.formState.errors.password?.message ??
                authErrorMessage(error, "password")
              }
            />
          </div>

          <FormAlert message={authErrorMessage(error, "global")} />

          <Button
            type="submit"
            disabled={
              resetForm.formState.isSubmitting || fetchStatus === "fetching"
            }
            className="mt-4 h-10 w-full"
          >
            {resetForm.formState.isSubmitting ? "Resetting…" : "Reset password"}
          </Button>
        </form>
      )}

      <p className="text-muted-foreground text-center text-sm font-light">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
