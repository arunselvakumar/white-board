import type { ReactNode } from "react";

import { BrandMark } from "@/components/app-shell/brand-mark";

/** The brand half of the public layout: a blueprint grid on the night colour. */
export function AuthBrandPanel() {
  return (
    <section
      aria-label="Construction Management"
      className="relative hidden min-h-svh min-w-0 flex-1 overflow-hidden lg:flex lg:flex-col lg:justify-end"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#322e58_0%,#1a1733_55%,#100e22_100%)]" />
      <div
        aria-hidden="true"
        className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:48px_48px] opacity-25"
      />
      <div className="relative space-y-4 p-12 text-white">
        <BrandMark className="size-11 rounded-xl" />
        <p className="max-w-md text-3xl leading-tight font-light">
          Every site, every bag of cement, every day&apos;s labour — in one
          place.
        </p>
        <p className="text-sm text-white/60">
          Projects, materials, labour and payments for builders and contractors.
        </p>
      </div>
    </section>
  );
}

/** The full-screen split layout used only by the sign-in and sign-up flows. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh">
      <AuthBrandPanel />
      <div className="flex min-h-svh w-full shrink-0 flex-col items-center justify-center overflow-y-auto px-8 py-12 lg:w-[min(46%,560px)]">
        <div className="w-full max-w-[352px] space-y-8">{children}</div>
      </div>
    </div>
  );
}
