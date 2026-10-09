"use client";

import Link from "next/link";

import { AuthHeading } from "./auth-heading";
import { AuthTabs } from "./auth-tabs";
import { EmailSignInForm } from "./email-sign-in-form";
import { MobileOtpFlow } from "./mobile-otp-flow";

/**
 * Email and password while SMS is off (ADR CM-0009); with `mobileOtp` the
 * mobile tab comes first again (ADR CM-0002).
 */
export function SignInForm({
  redirectUrl,
  mobileOtp = false,
}: {
  redirectUrl: string | null;
  mobileOtp?: boolean;
}) {
  return (
    <>
      <AuthHeading
        title="Sign in"
        description={
          mobileOtp
            ? "We'll text a code to your mobile."
            : "Sign in with your email and password."
        }
      />
      {mobileOtp ? (
        <AuthTabs
          mobile={<MobileOtpFlow mode="sign-in" redirectUrl={redirectUrl} />}
          email={<EmailSignInForm redirectUrl={redirectUrl} />}
        />
      ) : (
        <EmailSignInForm redirectUrl={redirectUrl} />
      )}
      <p className="text-muted-foreground text-center text-sm font-light">
        New here?{" "}
        <Link
          href="/sign-up"
          className="text-primary underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
