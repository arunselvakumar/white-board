"use client";

import type { Icon } from "@phosphor-icons/react";
import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { MoreHorizontal } from "lucide-react";
import { Component, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  EmptyState,
  type EmptyStateSize,
  type EmptyStateTone,
} from "@repo/ui/components/empty-state";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";

/**
 * Shared pieces of the HRMS Configuration screens: the page frame under the
 * HRMS tabs, empty states, row menus and the confirm dialog.
 */

/** A Configuration page: `w-full p-6`, a 4xl column, an h2 and its actions. */
export function HrmsPage({
  title,
  description,
  actions,
  children,
  wide = false,
}: {
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** A 6xl column, for grids. */
  wide?: boolean;
}) {
  return (
    <div className="w-full p-6">
      <div className={cn("w-full space-y-6", wide ? "max-w-6xl" : "max-w-4xl")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          {actions == null ? null : (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function HrmsEmpty({
  icon,
  title,
  description,
  action,
  tone,
  size,
  orbit,
}: {
  icon: Icon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: EmptyStateTone;
  size?: EmptyStateSize;
  orbit?: boolean;
}) {
  return (
    <EmptyState
      icon={icon}
      tone={tone}
      size={size}
      orbit={orbit}
      title={title}
      description={description}
      actions={action}
      className="bg-card border"
    />
  );
}

/** The "no access" state of an HRMS page whose read answered 403. */
export function HrmsNoAccess({ what }: { what: string }) {
  return (
    <HrmsEmpty
      icon={LockSimpleIcon}
      tone="neutral"
      orbit={false}
      title={`You don't have access to ${what}`}
      description="Your Permission Matrix does not include it. Ask the Owner if you need it."
    />
  );
}

/**
 * Shows "You don't have access to …" for a 403 from a page read (a member
 * whose Permission Matrix lacks the menu); any other error goes on to the
 * app's boundary (`QuerySuspense`). A `resetKey` change (the page's path)
 * clears it, so the boundary need not be remounted on navigation.
 */
export class HrmsAccessBoundary extends Component<
  { children: ReactNode; what: string; resetKey?: string },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidUpdate(previous: { resetKey?: string }) {
    if (this.state.error != null && previous.resetKey !== this.props.resetKey)
      this.setState({ error: null });
  }

  override render() {
    const { error } = this.state;
    if (error == null) return this.props.children;
    if (error instanceof QueryHttpError && error.status === 403)
      return <HrmsNoAccess what={this.props.what} />;
    // Not ours: the app's boundary shows it.
    throw error;
  }
}

export type RowAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

/** The "…" menu of a row; destructive actions go last, after a separator. */
export function RowMenu({
  name,
  actions,
  busy = false,
}: {
  name: string;
  actions: RowAction[];
  busy?: boolean;
}) {
  const plain = actions.filter((action) => action.destructive !== true);
  const destructive = actions.filter((action) => action.destructive === true);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={`Actions for ${name}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {plain.map((action) => (
          <DropdownMenuItem key={action.label} onClick={action.onSelect}>
            {action.label}
          </DropdownMenuItem>
        ))}
        {destructive.length > 0 && plain.length > 0 ? (
          <DropdownMenuSeparator />
        ) : null}
        {destructive.map((action) => (
          <DropdownMenuItem
            key={action.label}
            variant="destructive"
            onClick={action.onSelect}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Asks before a delete or remove; shows why the server refused. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  error,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  error: string | undefined;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormAlert message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** `8 h`, `7.5 h`. */
export function formatHours(hours: number): string {
  return `${String(Number(hours.toFixed(2)))} h`;
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `26 Jan 2026` for a calendar date. */
export function formatDate(date: string): string {
  return DAY_FORMAT.format(new Date(`${date}T00:00:00.000Z`));
}
