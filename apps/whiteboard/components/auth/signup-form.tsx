"use client";

import { navigateInApp, useAuth, useSignIn, useSignUp } from "@repo/auth/react";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthHeading } from "@/components/auth/auth-heading";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleButton } from "@/components/auth/google-button";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { PasswordField } from "@/components/auth/password-field";
import { authErrorMessage } from "@/lib/auth-errors";
import { workspaceEntryPath } from "@/lib/workspace-entry";

const detailsSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_.]+$/,
      "Use letters, numbers, underscores, and dots only",
    ),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

type DetailsValues = z.infer<typeof detailsSchema>;

/**
 * The Sign-up Flow: Username, Email, and password, then Email Verification.
 * Verifying the code signs the User in.
 */
export function SignupForm() {
  const { isSignedIn } = useAuth();
  const signUp = useSignUp();
  const signIn = useSignIn();
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const entryPath = workspaceEntryPath("/");

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
  });

  useEffect(() => {
    if (isSignedIn) navigateInApp(entryPath);
  }, [entryPath, isSignedIn]);

  const busy =
    detailsForm.formState.isSubmitting ||
    signUp.fetchStatus === "fetching" ||
    signIn.fetchStatus === "fetching";

  const onSubmitDetails = async (values: DetailsValues) => {
    const { error } = await signUp.create(values);
    if (error == null) setVerifyEmail(values.email.trim());
  };

  if (isSignedIn) {
    return <LoadingScreen />;
  }

  if (verifyEmail != null) {
    return (
      <>
        <AuthHeading
          title="Verify your email"
          description="Enter the 6-digit code we emailed you"
        />
        <EmailCodeForm
          email={verifyEmail}
          onVerified={() => {
            navigateInApp(entryPath);
          }}
        />
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Get started with Whiteboard"
      />

      <form
        onSubmit={(event) => {
          void detailsForm.handleSubmit(onSubmitDetails)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            placeholder="Choose a username"
            className="h-10"
            {...detailsForm.register("username")}
          />
          <FieldError
            message={
              detailsForm.formState.errors.username?.message ??
              authErrorMessage(signUp.error, "username")
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Enter your email"
            className="h-10"
            {...detailsForm.register("email")}
          />
          <FieldError
            message={
              detailsForm.formState.errors.email?.message ??
              authErrorMessage(signUp.error, "email")
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            placeholder="Create a password"
            {...detailsForm.register("password")}
          />
          <FieldError
            message={
              detailsForm.formState.errors.password?.message ??
              authErrorMessage(signUp.error, "password")
            }
          />
        </div>

        <FormAlert
          message={
            authErrorMessage(signUp.error, "global") ??
            authErrorMessage(signIn.error, "global")
          }
        />

        <Button type="submit" disabled={busy} className="mt-4 h-10 w-full">
          {detailsForm.formState.isSubmitting
            ? "Creating account…"
            : "Create account"}
        </Button>
      </form>

      <AuthDivider />

      <GoogleButton
        label="Continue with Google"
        disabled={busy}
        onClick={() => {
          void signIn.google(entryPath);
        }}
      />

      <p className="text-muted-foreground text-center text-sm font-light">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
