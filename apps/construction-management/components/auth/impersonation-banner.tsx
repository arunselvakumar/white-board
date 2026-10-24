"use client";

import {
  useCompanyAuth,
  useCompanySignOut,
  useCompanyUser,
} from "@repo/auth/construction/react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@repo/ui/components/button";

/**
 * The amber bar pinned to the top of every page while White Board staff are
 * signed in as a customer (ADR CM-0029). Stop signs out and goes back to
 * Sign in as. The root layout reserves its height with
 * `data-impersonating` on `<html>` (see globals.css).
 */
export function ImpersonationBanner() {
  const { impersonatedBy } = useCompanyAuth();
  const { user } = useCompanyUser();
  const { signOut, fetchStatus } = useCompanySignOut();
  if (impersonatedBy == null || user == null) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-60 flex h-(--impersonation-bar) items-center justify-center gap-2 border-b border-amber-500 bg-amber-300 px-4 text-sm text-amber-950 sm:gap-3 print:hidden"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 truncate">
        <span className="hidden sm:inline">You are signed in as </span>
        <strong className="font-semibold">{user.email}</strong>
        <span className="hidden md:inline">
          {" "}
          · Impersonated by {impersonatedBy}
        </span>
      </p>
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={fetchStatus === "fetching"}
        className="border-amber-700/40 bg-amber-50 text-amber-950 hover:bg-white"
        onClick={() => {
          void signOut("/sign-in/as");
        }}
      >
        Stop
      </Button>
    </div>
  );
}
