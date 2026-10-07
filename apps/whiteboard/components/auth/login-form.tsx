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

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

const UNVERIFIED_USERNAME =
  "Verify your email before signing in. Sign in with your email address to get a new code.";

/**
 * The Sign-in Flow: a Sign-in Identifier and password, or Google. A User who
 * never verified their email is sent a new code and verifies here.
 */
export function LoginForm({
  redirectUrl,
  initialError,
}: {
  redirectUrl: string;
  initialError?: string;
}) {
  const { isSignedIn } = useAuth();
  const signIn = useSignIn();
  const verification = useSignUp();
  const entryPath = workspaceEntryPath(redirectUrl);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | undefined>(initialError);

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (isSignedIn) navigateInApp(entryPath);
  }, [entryPath, isSignedIn]);

  const busy =
    isSubmitting ||
    signIn.fetchStatus === "fetching" ||
    verification.fetchStatus === "fetching";

  const onSubmit = async (values: LoginValues) => {
    setNotice(undefined);
    const { error } = await signIn.password(values);
    if (error == null) {
      navigateInApp(entryPath);
      return;
    }
    if (error.code !== "EMAIL_NOT_VERIFIED") return;
    signIn.clearError();
    const identifier = values.identifier.trim();
    if (!identifier.includes("@")) {
      setNotice(UNVERIFIED_USERNAME);
      return;
    }
    const sent = await verification.sendEmailCode(identifier);
    if (sent.error == null) setVerifyEmail(identifier);
  };

  const continueWithGoogle = () => {
    setNotice(undefined);
    void signIn.google(entryPath);
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
          submitLabel="Verify"
          onVerified={() => {
            navigateInApp(entryPath);
          }}
        />
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Welcome back" description="Sign in to continue" />

      <form
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="space-y-4"
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email or username</Label>
          <Input
            id="identifier"
            autoComplete="username"
            autoFocus
            placeholder="Enter your email or username"
            className="h-10"
            {...register("identifier")}
          />
          <FieldError message={formErrors.identifier?.message} />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-primary text-xs hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordField
            id="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            {...register("password")}
          />
          <FieldError
            message={
              formErrors.password?.message ??
              authErrorMessage(signIn.error, "password")
            }
          />
        </div>

        <FormAlert
          message={
            notice ??
            authErrorMessage(signIn.error, "global") ??
            authErrorMessage(verification.error, "global")
          }
        />

        <Button type="submit" disabled={busy} className="mt-4 h-10 w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <AuthDivider />

      <GoogleButton
        label="Continue with Google"
        disabled={busy}
        onClick={continueWithGoogle}
      />

      <p className="text-muted-foreground text-center text-sm font-light">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </>
  );
}
