"use client";

import Link from "next/link";

import { AuthHeading } from "./auth-heading";
import { AuthTabs } from "./auth-tabs";
import { EmailSignInForm } from "./email-sign-in-form";
import { MobileOtpFlow } from "./mobile-otp-flow";

export function SignInForm({ redirectUrl }: { redirectUrl: string | null }) {
  return (
    <>
      <AuthHeading
        title="Sign in"
        description="We'll text a code to your mobile."
      />
      <AuthTabs
        mobile={<MobileOtpFlow mode="sign-in" redirectUrl={redirectUrl} />}
        email={<EmailSignInForm redirectUrl={redirectUrl} />}
      />
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
