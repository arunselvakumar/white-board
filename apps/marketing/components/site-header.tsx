"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

const focusRing =
  "rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const anchors = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#fees", label: "Fees" },
  { href: "#who", label: "Who it's for" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => {
      setScrolled(window.scrollY > 24);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-200",
        scrolled
          ? "border-border bg-background/85 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <a
        href="#main"
        className="bg-primary text-primary-foreground focus-visible:ring-ring/50 sr-only rounded-md px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:top-3 focus:left-4 focus:z-[60] focus-visible:ring-3 focus-visible:outline-none"
      >
        Skip to content
      </a>
      <div className="container-site flex h-16 items-center gap-6">
        <a
          href="#main"
          aria-label="Whiteboard home"
          className={cn("flex shrink-0 items-center gap-2.5", focusRing)}
        >
          <Image
            src="/whiteboard-logo.svg"
            alt="Whiteboard"
            width={28}
            height={28}
            priority
          />
          <span className="hidden text-lg font-semibold tracking-[-0.01em] min-[390px]:inline">
            Whiteboard
          </span>
        </a>

        <nav
          aria-label="Primary"
          className="ml-auto hidden items-center gap-7 md:flex"
        >
          {anchors.map((anchor) => (
            <a
              key={anchor.href}
              href={anchor.href}
              className={cn(
                "text-foreground/75 hover:text-foreground text-sm font-semibold transition-colors",
                focusRing,
              )}
            >
              {anchor.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-5 md:ml-0">
          <a
            href="/app/login"
            className={cn(
              "text-primary hover:text-brand-800 hidden text-sm font-semibold transition-colors md:inline",
              focusRing,
            )}
          >
            Sign in
          </a>
          <Button
            render={<a href="/app/signup" />}
            nativeButton={false}
            size="lg"
            className="h-10 px-4 text-sm font-semibold"
          >
            Create your Workspace
          </Button>
        </div>
      </div>
    </header>
  );
}
