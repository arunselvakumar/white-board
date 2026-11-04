"use client";

import * as React from "react";
import { cn } from "cn";
import { SearchIcon } from "lucide-react";

import { Input } from "@repo/ui/components/input";

/**
 * The parts of the ink sidebar (ADR-0049) that both apps compose around the
 * `Sidebar` kit: the account row, the menu search, a section label with
 * its actions, a count on a menu row, the meter card and the footnote.
 */

/** The account row at the top: an avatar, a name, a detail line and an action (the account menu). */
function SidebarAccount({
  avatar,
  name,
  detail,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  avatar: React.ReactNode;
  name: React.ReactNode;
  detail?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="sidebar-account"
      className={cn("flex min-w-0 items-center gap-3 px-2 py-1", className)}
      {...props}
    >
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="text-sidebar-foreground truncate text-sm leading-tight font-semibold">
          {name}
        </p>
        {detail != null && (
          <p className="text-sidebar-foreground/55 truncate text-xs leading-tight">
            {detail}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * The search pill under the account row. It is a plain text box; the app
 * decides what it filters (the menu) and passes `value` / `onChange`.
 */
function SidebarSearch({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "glow">) {
  return (
    <div data-slot="sidebar-search" className="relative">
      <SearchIcon
        aria-hidden="true"
        className="text-sidebar-foreground/50 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        glow={false}
        className={cn(
          "bg-sidebar-accent text-sidebar-foreground placeholder:text-sidebar-foreground/45 focus-visible:border-sidebar-ring/60 focus-visible:ring-sidebar-ring/30 h-10 rounded-full border-transparent pl-10 text-sm [&::-webkit-search-cancel-button]:appearance-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}

/** A section label (“My Services”): small caps on the left, optional actions on the right. */
function SidebarSectionLabel({
  children,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & { action?: React.ReactNode }) {
  return (
    <div
      data-slot="sidebar-section-label"
      className={cn(
        "flex h-8 items-center justify-between gap-2 px-3",
        className,
      )}
      {...props}
    >
      <span className="text-sidebar-foreground/55 truncate text-[11px] font-semibold tracking-[0.12em] uppercase">
        {children}
      </span>
      {action != null && (
        <span className="flex shrink-0 items-center gap-0.5">{action}</span>
      )}
    </div>
  );
}

/**
 * A count at the right end of a menu row. `muted` is a figure (“21”);
 * `alert` is a red pill (“99+”). Inside the row's button, after the label.
 */
function SidebarMenuCount({
  tone = "muted",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "alert" }) {
  return (
    <span
      data-slot="sidebar-menu-count"
      data-tone={tone}
      className={cn(
        "ml-auto shrink-0 text-xs font-medium tabular-nums",
        tone === "muted" &&
          "text-sidebar-foreground/50 group-hover/menu-button:text-sidebar-foreground/70 group-data-active/menu-button:text-sidebar-primary-foreground/80",
        tone === "alert" &&
          "bg-destructive flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-none font-semibold text-white",
        className,
      )}
      {...props}
    />
  );
}

/** A ring meter: `percent` of the circle in the primary colour, the figure in the middle. */
function SidebarMeter({
  percent,
  label,
  className,
}: {
  percent: number;
  /** What the figure in the middle says (“64%”, “12d”). */
  label: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 17;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      data-slot="sidebar-meter"
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 40 40"
        className="absolute inset-0 size-full -rotate-90"
      >
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          className="stroke-sidebar-foreground/12"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="stroke-sidebar-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="text-sidebar-foreground relative text-[11px] font-semibold tabular-nums">
        {label}
      </span>
    </span>
  );
}

/**
 * The card above the footer (“Your Cloud · 64% · 13 GB left”): a meter or
 * an icon on the left, a title and a caption, and anything below it (a link).
 */
function SidebarMeterCard({
  lead,
  title,
  caption,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** A `SidebarMeter`, or an icon in a tile. */
  lead: React.ReactNode;
  title: React.ReactNode;
  caption?: React.ReactNode;
}) {
  return (
    <div
      data-slot="sidebar-meter-card"
      className={cn(
        "bg-sidebar-accent/70 ring-sidebar-border/60 rounded-2xl p-3 ring-1",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        {lead}
        <div className="min-w-0 flex-1">
          <p className="text-sidebar-foreground truncate text-sm leading-tight font-semibold">
            {title}
          </p>
          {caption != null && (
            <p className="text-sidebar-foreground/55 mt-0.5 truncate text-xs leading-tight">
              {caption}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/** The last line of the sidebar: the version, in the smallest muted type. */
function SidebarFootnote({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sidebar-footnote"
      className={cn(
        "text-sidebar-foreground/35 px-3 pt-1 text-[11px] tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export {
  SidebarAccount,
  SidebarFootnote,
  SidebarMenuCount,
  SidebarMeter,
  SidebarMeterCard,
  SidebarSearch,
  SidebarSectionLabel,
};
