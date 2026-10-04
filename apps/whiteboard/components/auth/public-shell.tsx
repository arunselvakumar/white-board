import type { ReactNode } from "react";

import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { PageTransition } from "@/components/page-transition";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh">
      <AuthBrandPanel />
      <div className="flex min-h-svh w-full shrink-0 flex-col items-center justify-center overflow-y-auto px-8 py-12 lg:w-[min(46%,560px)]">
        <div className="w-full max-w-[352px]">
          <PageTransition className="space-y-8">{children}</PageTransition>
        </div>
      </div>
    </div>
  );
}
