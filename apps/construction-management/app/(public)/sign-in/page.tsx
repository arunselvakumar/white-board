import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";

export const metadata: Metadata = { title: "Sign in" };

/** Mobile OTP and email sign-in arrive with CM-103. */
export default function SignInPage() {
  return (
    <AuthHeading
      title="Sign in"
      description="Sign in with your mobile number. Coming in the next release."
    />
  );
}
