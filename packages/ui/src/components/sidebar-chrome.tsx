"use client";

import * as React from "react";
import { cn } from "cn";
import { ChevronsUpDown, SearchIcon } from "lucide-react";

import { Input } from "@repo/ui/components/input";
import { SidebarTrigger, useSidebar } from "@repo/ui/components/sidebar";

/**
 * The parts of the ink sidebar (ADR-0049) that both apps compose around the
 * `Sidebar` kit: the switcher row, the account row, the menu search, a
 * section label with its actions, a count on a menu row, the meter card,
 * the footnote, and the phone's top bar (ADR-0050).
 */

/**
 * The first row of the sidebar (ADR-0050): the product mark, the Active
 * Workspace or Company, and the product's name under it, with the chevrons
 * that open the switcher. A `<button>`, so a `DropdownMenuTrigger` can
 * `render` it.
 */
function SidebarSwitcher({
  mark,
  name,
  detail,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  mark: React.ReactNode;
  name: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-slot="sidebar-switcher"
      className={cn(
        "hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent focus-visible:ring-sidebar-ring flex h-14 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl px-2 text-left transition-colors outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    >
      {mark}
      <span className="min-w-0 flex-1">
        <span className="text-sidebar-foreground block truncate text-sm leading-tight font-semibold">
          {name}
        </span>
        {detail != null && (
          <span className="text-sidebar-foreground/55 block truncate text-xs leading-tight">
            {detail}
          </span>
        )}
      </span>
      <ChevronsUpDown
        aria-hidden="true"
        className="text-sidebar-foreground/50 size-4 shrink-0"
      />
    </button>
  );
}

/**
 * With no top bar from `md` up (ADR-0050), the only way back from a
 * collapsed sidebar (Cmd/Ctrl+B) would be the shortcut again. This is a
 * trigger pinned to the page's top-left corner that shows only while the
 * desktop sidebar is collapsed. Render it first inside `SidebarInset`.
 */
function SidebarReopenTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SidebarTrigger>) {
  const { state, isMobile } = useSidebar();
  if (isMobile || state !== "collapsed") return null;
  return (
    <SidebarTrigger
      data-slot="sidebar-reopen-trigger"
      className={cn(
        "bg-card/85 ring-border/70 fixed top-3 left-3 z-20 hidden rounded-lg shadow-sm ring-1 backdrop-blur md:inline-flex print:hidden",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The only top bar left (ADR-0050): on a phone, where the sidebar is a
 * sheet, a slim bar with the trigger that opens it and whatever the app
 * puts beside it (its mark and name, the notification bell). From `md`
 * up nothing renders; the sidebar carries all of it.
 */
function SidebarPhoneBar({
  className,
  children,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="sidebar-phone-bar"
      className={cn(
        "bg-card/85 border-border/70 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:hidden print:hidden",
        className,
      )}
      {...props}
    >
      <SidebarTrigger />
      {children}
    </header>
  );
}

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
 * The figure is hidden from assistive technology; `label` is what it reads
 * instead (“21 active Students”), so the row's name carries the meaning.
 */
function SidebarMenuCount({
  tone = "muted",
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "muted" | "alert";
  /** What a screen reader hears for the figure. */
  label: string;
}) {
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
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </span>
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
  SidebarPhoneBar,
  SidebarReopenTrigger,
  SidebarSearch,
  SidebarSectionLabel,
  SidebarSwitcher,
};
