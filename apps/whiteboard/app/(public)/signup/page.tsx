import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";

export default async function SignupPage() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated) {
    redirect("/");
  }

  return <SignupForm />;
}
