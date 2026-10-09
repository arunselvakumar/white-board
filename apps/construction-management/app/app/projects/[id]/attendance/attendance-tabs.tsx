"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@repo/ui/lib/utils";

/** Labour and Vendor attendance of a Project (CM-211, CM-213). */
export const ATTENDANCE_TABS = [
  { segment: "labour", label: "Labour" },
  { segment: "vendors", label: "Vendor" },
] as const;

/** The Attendance sub-tabs under the project shell. */
export function AttendanceTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/app/projects/${encodeURIComponent(projectId)}/attendance`;
  return (
    <nav aria-label="Attendance">
      <ul className="bg-secondary/70 inline-flex gap-1 rounded-xl border p-1">
        {ATTENDANCE_TABS.map((tab) => {
          const href = `${base}/${tab.segment}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.segment}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring/50 inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3",
                  active
                    ? "bg-card text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
