"use client";

import {
  navigateInApp,
  useCompanyEmailSignIn,
  useCompanyEmailSignUp,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { authErrorMessage } from "@/lib/auth-errors";
import { continuePath } from "@/lib/safe-redirect";

import { CodeForm } from "./code-form";
import { FieldError } from "./field-error";
import { FormAlert } from "./form-alert";
import { PasswordField } from "./password-field";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

type Values = z.infer<typeof schema>;

/** Email and password sign-in (ADR CM-0009). An unverified email verifies here. */
export function EmailSignInForm({
  redirectUrl,
}: {
  redirectUrl: string | null;
}) {
  const signIn = useCompanyEmailSignIn();
  const verification = useCompanyEmailSignUp();
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });
  const busy =
    form.formState.isSubmitting ||
    signIn.fetchStatus === "fetching" ||
    verification.fetchStatus === "fetching";

  const onSubmit = async (values: Values) => {
    const { error } = await signIn.signIn(values);
    if (error == null) {
      navigateInApp(continuePath(redirectUrl));
      return;
    }
    if (error.code !== "EMAIL_NOT_VERIFIED") return;
    signIn.clearError();
    const sent = await verification.sendEmailCode(values.email);
    if (sent.error == null) setVerifyEmail(values.email.trim());
  };

  if (verifyEmail != null) {
    return (
      <CodeForm
        sentTo={verifyEmail}
        submitLabel="Verify and sign in"
        busy={busy}
        serverError={
          authErrorMessage(verification.error, "code") ??
          authErrorMessage(verification.error, "global")
        }
        onSubmit={async (code) => {
          const result = await verification.verifyEmailCode({
            email: verifyEmail,
            code,
          });
          if (result.error == null) navigateInApp(continuePath(redirectUrl));
        }}
        onResend={async () => {
          const result = await verification.sendEmailCode(verifyEmail);
          return result.error == null;
        }}
        onChangeDestination={() => {
          setVerifyEmail(null);
        }}
        changeLabel="Use another email"
      />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(onSubmit)(event);
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
          placeholder="you@company.in"
          className="h-10"
          {...form.register("email")}
        />
        <FieldError
          message={
            form.formState.errors.email?.message ??
            authErrorMessage(signIn.error, "email")
          }
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordField
          id="password"
          autoComplete="current-password"
          placeholder="Your password"
          {...form.register("password")}
        />
        <FieldError message={form.formState.errors.password?.message} />
      </div>
      <FormAlert
        message={
          authErrorMessage(signIn.error, "global") ??
          authErrorMessage(verification.error, "global")
        }
      />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
