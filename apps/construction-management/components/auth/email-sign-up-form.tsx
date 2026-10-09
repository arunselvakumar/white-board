"use client";

import {
  navigateInApp,
  useCompanyEmailSignUp,
} from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
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
  name: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(100, "Name is too long"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "Password is too long"),
});

type Values = z.infer<typeof schema>;

/** Email sign-up: details, then the emailed code, which signs the User in. */
export function EmailSignUpForm({
  redirectUrl,
}: {
  redirectUrl: string | null;
}) {
  const signUp = useCompanyEmailSignUp();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "" },
  });
  const busy = form.formState.isSubmitting || signUp.fetchStatus === "fetching";

  if (sentTo != null) {
    return (
      <CodeForm
        sentTo={sentTo}
        submitLabel="Verify email"
        busy={busy}
        serverError={
          authErrorMessage(signUp.error, "code") ??
          authErrorMessage(signUp.error, "global")
        }
        onSubmit={async (code) => {
          const result = await signUp.verifyEmailCode({ email: sentTo, code });
          if (result.error == null) navigateInApp(continuePath(redirectUrl));
        }}
        onResend={async () => {
          const result = await signUp.sendEmailCode(sentTo);
          return result.error == null;
        }}
        onChangeDestination={() => {
          setSentTo(null);
        }}
        changeLabel="Use another email"
      />
    );
  }

  return (
    <form
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const result = await signUp.create(values);
          if (result.error == null) setSentTo(values.email.trim());
        })(event);
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="sign-up-name">Your name</Label>
        <Input
          id="sign-up-name"
          autoComplete="name"
          placeholder="Arun Selva Kumar"
          className="h-10"
          {...form.register("name")}
        />
        <FieldError message={form.formState.errors.name?.message} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sign-up-email">Email</Label>
        <Input
          id="sign-up-email"
          type="email"
          autoComplete="email"
          placeholder="you@company.in"
          className="h-10"
          {...form.register("email")}
        />
        <FieldError
          message={
            form.formState.errors.email?.message ??
            authErrorMessage(signUp.error, "email")
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sign-up-password">Password</Label>
        <PasswordField
          id="sign-up-password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          {...form.register("password")}
        />
        <FieldError
          message={
            form.formState.errors.password?.message ??
            authErrorMessage(signUp.error, "password")
          }
        />
      </div>
      <FormAlert message={authErrorMessage(signUp.error, "global")} />
      <Button type="submit" disabled={busy} className="h-10 w-full">
        {busy ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
