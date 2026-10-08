"use client";

import Link from "next/link";

import { AuthHeading } from "./auth-heading";
import { AuthTabs } from "./auth-tabs";
import { EmailSignUpForm } from "./email-sign-up-form";
import { MobileOtpFlow } from "./mobile-otp-flow";

export function SignUpForm({ redirectUrl }: { redirectUrl: string | null }) {
  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Start a 14-day free trial for your Company."
      />
      <AuthTabs
        mobile={<MobileOtpFlow mode="sign-up" redirectUrl={redirectUrl} />}
        email={<EmailSignUpForm redirectUrl={redirectUrl} />}
      />
      <p className="text-muted-foreground text-center text-sm font-light">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
