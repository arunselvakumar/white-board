"use client";

import * as React from "react";
import { cn } from "cn";
import { ArrowLeftRight, Check, SearchIcon } from "lucide-react";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import {
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@repo/ui/components/sidebar";
import { Spinner } from "@repo/ui/components/spinner";

/**
 * The parts of the ink sidebar (ADR-0049) that both apps compose around the
 * `Sidebar` kit: the account row, the menu search, a section label with its
 * actions, a count on a menu row, the meter card, the footnote, the switch
 * row and its modal (ADR-0051), and the phone's top bar (ADR-0050).
 */

/** One Workspace or Company in the `SidebarSwitch` modal. */
type SidebarSwitchItem = {
  id: string;
  name: string;
  /** The line under the name (the User's role there). */
  detail?: string;
};

/**
 * The switch row at the foot of the sidebar and the modal it opens
 * (ADR-0051). `label` is both, in the app's own word: “Switch Workspace”,
 * “Switch Company”. Picking a row calls `onPick` and leaves the modal open
 * with a spinner on it, since the app reloads once the switch lands;
 * `error` says why it did not. Picking the current one just closes.
 * Below `md` the sidebar is a sheet, so the modal opens nested over it.
 */
function SidebarSwitch({
  label,
  rowLabel,
  description,
  rowClassName,
  items,
  activeId,
  pendingId,
  error,
  onPick,
  onOpenChange,
  footer,
}: {
  label: string;
  /** The row's accessible name: `label`, then which one is active. */
  rowLabel: string;
  description: string;
  /** The app's sidebar row class, so this row matches the ones beside it. */
  rowClassName?: string;
  items: readonly SidebarSwitchItem[];
  activeId: string | null;
  pendingId: string | null;
  error?: string | null;
  onPick: (id: string) => void;
  /** Runs as the modal opens or closes (clear an old `error` here). */
  onOpenChange?: (open: boolean) => void;
  /** Anything under the list (Create a Company). */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <SidebarMenuButton className={rowClassName} aria-label={rowLabel} />
        }
      >
        <ArrowLeftRight />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </DialogTrigger>
      <DialogContent forceOverlay className="grid-cols-1 sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ul
          data-slot="sidebar-switch-list"
          className="-mx-1 flex max-h-[min(22rem,55dvh)] min-w-0 flex-col gap-2 overflow-y-auto px-1 py-0.5"
        >
          {items.map((item) => {
            const active = item.id === activeId;
            const pending = item.id === pendingId;
            return (
              <li key={item.id} className="min-w-0">
                <Button
                  type="button"
                  variant="outline"
                  aria-current={active ? "true" : undefined}
                  disabled={pendingId != null}
                  onClick={() => {
                    if (active) changeOpen(false);
                    else onPick(item.id);
                  }}
                  className={cn(
                    "hover:border-primary/60 h-auto w-full min-w-0 justify-start gap-3 rounded-xl p-3 text-left font-normal whitespace-normal",
                    active &&
                      "border-primary/60 bg-primary/5 dark:border-primary/70 dark:bg-primary/10",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
                  >
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-foreground block truncate text-sm font-medium">
                      {item.name}
                    </span>
                    {item.detail != null && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {item.detail}
                      </span>
                    )}
                  </span>
                  {pending && <Spinner className="text-primary shrink-0" />}
                  {active && (
                    <span className="text-primary flex shrink-0 items-center gap-1 text-xs font-medium">
                      <Check aria-hidden="true" className="size-4" />
                      Current
                    </span>
                  )}
                </Button>
              </li>
            );
          })}
        </ul>
        {error != null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {footer}
      </DialogContent>
    </Dialog>
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
  SidebarSwitch,
};
