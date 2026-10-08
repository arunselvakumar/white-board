"use client";

import { MoreHorizontal, Search, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";

export const byName = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});

export function MasterSearch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup className="sm:max-w-xs">
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </InputGroup>
  );
}

export function MasterEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>{action}</EmptyContent>
    </Empty>
  );
}

/** One row: name, details, badges, and the row menu. Disabled rows are muted. */
export function MasterRow({
  name,
  details,
  isSeed = false,
  disabled,
  busy,
  onEdit,
  editLabel,
  onToggle,
  onDelete,
}: {
  name: string;
  details?: ReactNode;
  isSeed?: boolean;
  disabled: boolean;
  busy: boolean;
  /** Absent for seed rows, which cannot be renamed. */
  onEdit?: () => void;
  editLabel: string;
  onToggle: () => void;
  /** Absent for seed rows, which cannot be deleted. */
  onDelete?: () => void;
}) {
  return (
    <li
      className="flex items-center gap-3 px-4 py-3"
      data-disabled={disabled ? "" : undefined}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "truncate font-medium",
            disabled ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {name}
        </p>
        {details}
        {isSeed || disabled ? (
          <div className="flex flex-wrap gap-1.5">
            {isSeed ? <Badge variant="secondary">Default</Badge> : null}
            {disabled ? <Badge variant="outline">Disabled</Badge> : null}
          </div>
        ) : null}
      </div>
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
        <DropdownMenuContent align="end" className="w-40">
          {onEdit != null ? (
            <DropdownMenuItem onClick={onEdit}>{editLabel}</DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={onToggle}>
            {disabled ? "Enable" : "Disable"}
          </DropdownMenuItem>
          {onDelete != null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Asks before a delete; shows why the server refused (in use). */
export function ConfirmDeleteDialog({
  name,
  description,
  error,
  pending,
  onConfirm,
  onClose,
}: {
  /** Null while closed. */
  name: string | null;
  description: string;
  error: string | undefined;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={name != null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name ?? ""}?</AlertDialogTitle>
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
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
