import type { Metadata } from "next";

import { AuthHeading } from "@/components/auth/auth-heading";

export const metadata: Metadata = { title: "Sign up" };

/** Mobile OTP and email sign-up arrive with CM-103. */
export default function SignUpPage() {
  return (
    <AuthHeading
      title="Create your account"
      description="Sign up with your mobile number. Coming in the next release."
    />
  );
}
