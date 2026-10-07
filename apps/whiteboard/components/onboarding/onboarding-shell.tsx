"use client";

import type { ReactNode } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageTransition } from "@/components/page-transition";

export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[352px]">
          <PageTransition className="space-y-8">{children}</PageTransition>
        </div>
      </div>
      <div className="flex justify-center pb-8">
        <SignOutButton />
      </div>
    </div>
  );
}
