"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { AuthDivider } from "./auth-divider";
import { AuthHeading } from "./auth-heading";
import { EmailSignInForm } from "./email-sign-in-form";
import { MobileOtpFlow } from "./mobile-otp-flow";
import { MobilePasswordSignInForm } from "./mobile-password-sign-in-form";

/**
 * Email | Mobile (ADR CM-0030 §7). Email and password as before (ADR
 * CM-0009); Mobile signs in with mobile and password whatever the SMS
 * switch, and with `mobileOtp` (SMS on) also offers the texted code
 * (ADR CM-0002), the tab it opens on then.
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
        description="With your email, or your mobile number, and password."
      />
      <Tabs defaultValue={mobileOtp ? "mobile" : "email"} className="gap-6">
        <TabsList variant="pill" className="w-full">
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="mobile">Mobile</TabsTrigger>
        </TabsList>
        <TabsContent value="email">
          <EmailSignInForm redirectUrl={redirectUrl} />
        </TabsContent>
        <TabsContent value="mobile">
          <MobileSignIn redirectUrl={redirectUrl} mobileOtp={mobileOtp} />
        </TabsContent>
      </Tabs>
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

/** The Mobile tab: password, or (SMS on) a texted code instead. */
function MobileSignIn({
  redirectUrl,
  mobileOtp,
}: {
  redirectUrl: string | null;
  mobileOtp: boolean;
}) {
  const [withCode, setWithCode] = useState(false);
  if (!mobileOtp) return <MobilePasswordSignInForm redirectUrl={redirectUrl} />;
  return (
    <div className="space-y-4">
      {withCode ? (
        <MobileOtpFlow mode="sign-in" redirectUrl={redirectUrl} />
      ) : (
        <MobilePasswordSignInForm redirectUrl={redirectUrl} />
      )}
      <AuthDivider />
      <Button
        type="button"
        variant="outline"
        className="h-10 w-full"
        onClick={() => {
          setWithCode((value) => !value);
        }}
      >
        {withCode ? "Use my password instead" : "Text me a code instead"}
      </Button>
    </div>
  );
}
