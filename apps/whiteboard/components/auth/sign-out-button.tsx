"use client";

import { useSignOut } from "@repo/auth/react";
import { Button } from "@repo/ui/components/button";

/** Signs out from any screen with a Session, then shows Sign-in. */
export function SignOutButton() {
  const { signOut, fetchStatus } = useSignOut();
  return (
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
  );
}
