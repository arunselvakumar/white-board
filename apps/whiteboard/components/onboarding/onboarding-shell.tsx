"use client";

import { SignOutButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Button } from "@repo/ui/components/button";

export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[352px] space-y-8">{children}</div>
      </div>
      <div className="flex justify-center pb-8">
        <SignOutButton redirectUrl="/app/login">
          <Button variant="ghost" size="sm">
            Sign out
          </Button>
        </SignOutButton>
      </div>
    </div>
  );
}
