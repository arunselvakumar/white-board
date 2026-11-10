import type { Metadata } from "next";

import { SignInAsForm } from "@/app/(public)/sign-in/as/_components/sign-in-as-form";

export const metadata: Metadata = { title: "Sign in as a customer" };

/**
 * White Board staff sign in as a customer (ADR CM-0029). Not linked from
 * anywhere, and open while signed in: it replaces the browser's Session.
 */
export default function SignInAsPage() {
  return <SignInAsForm />;
}
