"use client";

import { useCompanySignOut } from "@repo/auth/construction/react";
import type { ReactNode } from "react";
import { Button } from "@repo/ui/components/button";

import { BrandMark } from "@/components/app-shell/brand-mark";

/**
 * Full-screen shell for Create Company and Choose Company. A Session exists;
 * there is no app chrome, but a stuck User can sign out.
 */
export function OnboardingShell({ children }: { children: ReactNode }) {
  const { signOut, fetchStatus } = useCompanySignOut();
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-semibold">Construction Management</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={fetchStatus === "fetching"}
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
      </header>
      <main className="flex flex-1 justify-center px-6 py-10">
        <div className="w-full max-w-lg space-y-8">{children}</div>
      </main>
    </div>
  );
}
