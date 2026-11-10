import { DottedLogo } from "@/components/auth/dotted-logo";

export function AuthBrandPanel() {
  return (
    <section
      aria-label="Whiteboard"
      className="relative hidden min-h-svh min-w-0 flex-1 overflow-hidden lg:block"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,#322e58_0%,#1a1733_52%,#100e22_100%)]" />
      <DottedLogo className="absolute inset-0 h-full w-full" />
    </section>
  );
}
