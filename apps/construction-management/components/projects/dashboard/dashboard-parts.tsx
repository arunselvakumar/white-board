"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatPaise } from "@/components/money/money-input";
import { QueryHttpError } from "@/src/queries/http";

/**
 * The Project Dashboard's building blocks (CM-412): a section card, a
 * labelled figure with its grey units, and the 403 check sections use to
 * name the permission they need. Their loading skeletons are in
 * `dashboard-skeletons.tsx`.
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

/**
 * A labelled figure inside a section, in the metric cards' style: a soft
 * grey tile, the label small and grey, the figure larger in the
 * foreground colour. Put units in `Unit` so they read grey.
 */
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
    <div className="bg-muted/50 flex min-w-0 flex-col gap-2.5 rounded-[0.625rem] p-3.5 sm:p-4">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs sm:text-sm">
        {Icon == null ? null : (
          <Icon
            aria-hidden="true"
            strokeWidth={1.5}
            className="size-4 shrink-0"
          />
        )}
        {label}
      </dt>
      <dd className="text-lg leading-tight font-normal tracking-tight break-words tabular-nums sm:text-xl">
        {children}
      </dd>
    </div>
  );
}

/** A unit beside a figure (`₹`, `/24`, `km`), lighter and grey. */
export function Unit({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground font-light">{children}</span>;
}

/** Rupees with a grey `₹`, without `.00` on whole rupees. */
export function Rupees({ paise }: { paise: number }) {
  const text = formatPaise(paise).replace(/\.00$/, "");
  return (
    <>
      {text.startsWith("-") ? "-" : null}
      <Unit>₹</Unit>
      {text.replace(/^-?₹/, "")}
    </>
  );
}

export function denied(error: unknown): boolean {
  return error instanceof QueryHttpError && error.status === 403;
}
