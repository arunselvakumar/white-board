"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";

import { QueryHttpError } from "@/src/queries/http";

/**
 * The Project Dashboard's building blocks (CM-412): a section card, a
 * labelled figure, the loading skeleton, and the 403 check sections use to
 * name the permission they need.
 */

export function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Fact({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg px-3 py-2.5">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {Icon == null ? null : <Icon aria-hidden="true" className="size-3.5" />}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium break-words tabular-nums">
        {children}
      </dd>
    </div>
  );
}

export function SectionSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}

export function denied(error: unknown): boolean {
  return error instanceof QueryHttpError && error.status === 403;
}
