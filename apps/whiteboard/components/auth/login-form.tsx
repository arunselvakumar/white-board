"use client";

import { useAuth, useSignIn } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleButton } from "@/components/auth/google-button";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { PasswordField } from "@/components/auth/password-field";
import { clerkFieldMessage, clerkGlobalMessage } from "@/lib/clerk-errors";
import { navigateAfterAuth } from "@/lib/navigate-after-auth";
import { withAppBasePath } from "@/lib/app-base-path";
import { workspaceEntryPath } from "@/lib/workspace-entry";

const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginValues = z.infer<typeof loginSchema>;

const codeSchema = z.object({
  code: z
    .string()
    .min(6, "Enter the 6-digit code")
    .max(6, "Enter the 6-digit code"),
});

type CodeValues = z.infer<typeof codeSchema>;

export function LoginForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { isSignedIn } = useAuth();
  const entryPath = workspaceEntryPath(redirectUrl);
  const [step, setStep] = useState<"credentials" | "second-factor">(
    "credentials",
  );
  const [resent, setResent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const codeForm = useForm<CodeValues>({ resolver: zodResolver(codeSchema) });

  useEffect(() => {
    if (isSignedIn) {
      router.replace(entryPath);
    }
  }, [entryPath, isSignedIn, router]);

  const busy = isSubmitting || fetchStatus === "fetching";

  const onSubmit = async (values: LoginValues) => {
    const { error } = await signIn.password({
      identifier: values.identifier,
      password: values.password,
    });
    if (error) {
      return;
    }
    if (
      signIn.status === "needs_second_factor" ||
      signIn.status === "needs_client_trust"
    ) {
      const { error: sendError } = await signIn.mfa.sendEmailCode();
      if (sendError) {
        return;
      }
      setStep("second-factor");
      return;
    }
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: navigateAfterAuth(router, entryPath),
      });
    }
  };

  const onSubmitCode = async (values: CodeValues) => {
    const { error } = await signIn.mfa.verifyEmailCode({ code: values.code });
    if (error) {
      return;
    }
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: navigateAfterAuth(router, entryPath),
      });
    }
  };

  const resendCode = async () => {
    const { error } = await signIn.mfa.sendEmailCode();
    if (!error) {
      setResent(true);
    }
  };

  const continueWithGoogle = () => {
    void signIn.sso({
      strategy: "oauth_google",
      redirectUrl: withAppBasePath(entryPath),
      redirectCallbackUrl: withAppBasePath("/sso-callback"),
    });
  };

  if (isSignedIn) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title={step === "credentials" ? "Welcome back" : "Verify it's you"}
        description={
          step === "credentials"
            ? "Sign in to continue"
            : "Enter the 6-digit code we emailed you"
        }
      />

      {step === "credentials" ? (
        <>
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
              <FieldError
                message={
                  formErrors.identifier?.message ??
                  clerkFieldMessage(errors.fields.identifier)
                }
              />
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
                  clerkFieldMessage(errors.fields.password)
                }
              />
            </div>

            <FormAlert message={clerkGlobalMessage(errors.global)} />

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
      ) : (
        <form
          onSubmit={(event) => {
            void codeForm.handleSubmit(onSubmitCode)(event);
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
              {...codeForm.register("code")}
            />
            <FieldError
              message={
                codeForm.formState.errors.code?.message ??
                clerkFieldMessage(errors.fields.code)
              }
            />
          </div>

          <FormAlert message={clerkGlobalMessage(errors.global)} />

          <Button
            type="submit"
            disabled={
              codeForm.formState.isSubmitting || fetchStatus === "fetching"
            }
            className="mt-4 h-10 w-full"
          >
            {codeForm.formState.isSubmitting ? "Verifying…" : "Verify"}
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
      )}
    </>
  );
}
