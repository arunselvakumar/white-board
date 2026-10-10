"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  HRMS_PATH,
  HRMS_SECTIONS,
  activeHrmsPage,
  activeHrmsSection,
} from "@/lib/hrms-nav";

/**
 * The HRMS area (M3): title, the five sections as tabs, and the current
 * section's pages as sub-tabs. Both rows scroll sideways on a phone. Pages
 * render below and keep their own padding and width. The tab rows are
 * `contain: inline-size` so nine Configuration tabs scroll inside their row
 * instead of widening the page.
 */
export function HrmsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || HRMS_PATH;
  const section = activeHrmsSection(pathname);
  const page = activeHrmsPage(pathname);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="w-full space-y-4 px-6 pt-6">
        <div className="w-full max-w-6xl">
          <PageHeader
            back={{ label: "Workspace", href: "/app/workspace" }}
            title="HRMS"
            meta="Attendance, leave and salary for your staff."
          />
        </div>
        <nav
          aria-label="HRMS sections"
          className="-mx-6 overflow-x-auto border-b px-6 [contain:inline-size]"
        >
          <ul className="flex w-max gap-1">
            {HRMS_SECTIONS.map((item) => {
              const active = item.key === section?.key;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring/50 -mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                      active
                        ? "border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {section != null && section.pages.length > 1 && (
          <nav
            aria-label={section.label}
            className="-mx-6 overflow-x-auto px-6 [contain:inline-size]"
          >
            <ul className="bg-secondary/70 inline-flex w-max gap-1 rounded-xl border p-1">
              {section.pages.map((item) => {
                const active = item.href === page?.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-visible:ring-ring/50 inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                        active
                          ? "bg-card text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
      {children}
    </div>
  );
}
