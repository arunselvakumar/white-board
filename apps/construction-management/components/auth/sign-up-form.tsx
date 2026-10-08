"use client";

import Link from "next/link";

import { AuthHeading } from "./auth-heading";
import { AuthTabs } from "./auth-tabs";
import { EmailSignUpForm } from "./email-sign-up-form";
import { MobileOtpFlow } from "./mobile-otp-flow";

/**
 * Email and password while SMS is off (ADR CM-0009); with `mobileOtp` the
 * mobile tab comes first again (ADR CM-0002).
 */
export function SignUpForm({
  redirectUrl,
  mobileOtp = false,
}: {
  redirectUrl: string | null;
  mobileOtp?: boolean;
}) {
  return (
    <>
      <AuthHeading
        title="Create your account"
        description="Start a 14-day free trial for your Company."
      />
      {mobileOtp ? (
        <AuthTabs
          mobile={<MobileOtpFlow mode="sign-up" redirectUrl={redirectUrl} />}
          email={<EmailSignUpForm redirectUrl={redirectUrl} />}
        />
      ) : (
        <EmailSignUpForm redirectUrl={redirectUrl} />
      )}
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
