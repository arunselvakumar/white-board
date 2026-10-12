"use client";

import { useCompanySignOut } from "@repo/auth/construction/react";
import type { ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { BrandMark } from "@/components/app-shell/brand-mark";
import type { AuthPhoto } from "@/components/auth/auth-photos";
import { AuthBrandPanel } from "@/components/auth/public-shell";

/** A stuck User can always sign out of onboarding. */
function SignOutButton({ className }: { className?: string }) {
  const { signOut, fetchStatus } = useCompanySignOut();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      disabled={fetchStatus === "fetching"}
      onClick={() => {
        void signOut();
      }}
    >
      Sign out
    </Button>
  );
}

function BrandName({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BrandMark />
      <span className="text-sm font-semibold">Construction Management</span>
    </div>
  );
}

/**
 * Full-screen shell for Choose Company. A Session exists; there is no app
 * chrome, but a stuck User can sign out.
 */
export function OnboardingShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandName />
        <SignOutButton />
      </header>
      <main className="flex flex-1 justify-center px-6 py-10">
        <div className="w-full max-w-lg space-y-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * Create Company in the sign-in layout: the photo panel on the left, the
 * wizard on the right, so a new User's first run reads as one flow.
 */
export function OnboardingSplitShell({
  photo,
  children,
}: {
  photo?: AuthPhoto;
  children: ReactNode;
}) {
  return (
    <div className="bg-background flex min-h-svh">
      <AuthBrandPanel photo={photo} />
      <div className="flex min-h-svh w-full shrink-0 flex-col lg:w-[min(46%,560px)]">
        <header className="flex items-center justify-between px-8 py-4">
          {/* The photo panel carries the brand on wide screens. */}
          <BrandName className="lg:invisible" />
          <SignOutButton />
        </header>
        <main className="flex flex-1 justify-center px-8 pt-6 pb-12 lg:pt-[10vh]">
          <div className="w-full max-w-[400px] space-y-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
