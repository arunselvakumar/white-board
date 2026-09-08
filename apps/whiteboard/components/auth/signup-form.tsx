"use client";

import { useAuth, useSignUp } from "@clerk/nextjs";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@repo/ui/components/native-select";

import { AuthDivider } from "@/components/auth/auth-divider";
import { AuthHeading } from "@/components/auth/auth-heading";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { GoogleButton } from "@/components/auth/google-button";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { PasswordField } from "@/components/auth/password-field";
import { clerkFieldMessage, clerkGlobalMessage } from "@/lib/clerk-errors";
import { navigateAfterAuth } from "@/lib/navigate-after-auth";

const COUNTRY_CODES = [
  { iso: "IN", dial: "91" },
  { iso: "US", dial: "1" },
  { iso: "GB", dial: "44" },
  { iso: "AE", dial: "971" },
  { iso: "SG", dial: "65" },
  { iso: "AU", dial: "61" },
  { iso: "CA", dial: "1" },
  { iso: "DE", dial: "49" },
] as const;

const detailsSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.email("Enter a valid email address"),
  countryDial: z.string().min(1),
  phone: z
    .string()
    .min(6, "Enter a valid phone number")
    .regex(/^\d+$/, "Enter a valid phone number"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type DetailsValues = z.infer<typeof detailsSchema>;

const verifySchema = z.object({
  code: z
    .string()
    .min(6, "Enter the 6-digit code")
    .max(6, "Enter the 6-digit code"),
});

type VerifyValues = z.infer<typeof verifySchema>;

export function SignupForm() {
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const { isSignedIn } = useAuth();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [resent, setResent] = useState(false);

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { countryDial: "91" },
  });
  const verifyForm = useForm<VerifyValues>({
    resolver: zodResolver(verifySchema),
  });

  useEffect(() => {
    if (isSignedIn) {
      router.replace("/");
    }
  }, [isSignedIn, router]);

  const busy = detailsForm.formState.isSubmitting || fetchStatus === "fetching";

  const onSubmitDetails = async (values: DetailsValues) => {
    const { error } = await signUp.password({
      username: values.username,
      emailAddress: values.email,
      phoneNumber: `+${values.countryDial}${values.phone}`,
      password: values.password,
    });
    if (error) {
      return;
    }
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: navigateAfterAuth(router, "/"),
      });
      return;
    }
    if (signUp.unverifiedFields.includes("email_address")) {
      const { error: sendError } = await signUp.verifications.sendEmailCode();
      if (sendError) {
        return;
      }
      setStep("verify");
    }
  };

  const onSubmitVerify = async (values: VerifyValues) => {
    const { error } = await signUp.verifications.verifyEmailCode({
      code: values.code,
    });
    if (error) {
      return;
    }
    if (signUp.status === "complete") {
      await signUp.finalize({
        navigate: navigateAfterAuth(router, "/"),
      });
    }
  };

  const resendCode = async () => {
    const { error } = await signUp.verifications.sendEmailCode();
    if (!error) {
      setResent(true);
    }
  };

  const continueWithGoogle = () => {
    void signUp.sso({
      strategy: "oauth_google",
      redirectUrl: "/",
      redirectCallbackUrl: "/sso-callback",
    });
  };

  if (isSignedIn) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AuthHeading
        title={step === "details" ? "Create your account" : "Verify your email"}
        description={
          step === "details"
            ? "Get started with Whiteboard"
            : "Enter the 6-digit code we emailed you"
        }
      />

      {step === "details" ? (
        <>
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
                  clerkFieldMessage(errors.fields.username)
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
                  clerkFieldMessage(errors.fields.emailAddress)
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <div className="flex gap-2">
                <NativeSelect
                  aria-label="Country code"
                  className="w-[108px] shrink-0 [&_select]:h-10 [&_select]:min-h-10"
                  {...detailsForm.register("countryDial")}
                >
                  {COUNTRY_CODES.map((country) => (
                    <NativeSelectOption
                      key={`${country.iso}-${country.dial}`}
                      value={country.dial}
                    >
                      {country.iso} +{country.dial}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="Phone number"
                  className="h-10"
                  {...detailsForm.register("phone")}
                />
              </div>
              <FieldError
                message={
                  detailsForm.formState.errors.phone?.message ??
                  clerkFieldMessage(errors.fields.phoneNumber)
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
                  clerkFieldMessage(errors.fields.password)
                }
              />
            </div>

            <div id="clerk-captcha" />

            <FormAlert
              message={
                clerkFieldMessage(errors.fields.captcha) ??
                clerkGlobalMessage(errors.global)
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
            onClick={continueWithGoogle}
          />

          <p className="text-muted-foreground text-center text-sm font-light">
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            void verifyForm.handleSubmit(onSubmitVerify)(event);
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
              {...verifyForm.register("code")}
            />
            <FieldError
              message={
                verifyForm.formState.errors.code?.message ??
                clerkFieldMessage(errors.fields.code)
              }
            />
          </div>

          <FormAlert message={clerkGlobalMessage(errors.global)} />

          <Button
            type="submit"
            disabled={
              verifyForm.formState.isSubmitting || fetchStatus === "fetching"
            }
            className="mt-4 h-10 w-full"
          >
            {verifyForm.formState.isSubmitting ? "Verifying…" : "Verify email"}
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
