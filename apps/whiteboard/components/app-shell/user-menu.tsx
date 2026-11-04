"use client";

import { useSignOut, useUser, type AuthUser } from "@repo/auth/react";
import { cn } from "@repo/ui/lib/utils";
import { Ellipsis, LogOut } from "lucide-react";
import Image from "next/image";
import type { ReactElement } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { SidebarAccount } from "@repo/ui/components/sidebar-chrome";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return letters
    .map((part) => part?.slice(0, 1) ?? "")
    .join("")
    .toUpperCase();
}

function displayNameOf(user: AuthUser): string {
  return user.name.trim().length > 0
    ? user.name.trim()
    : (user.username ?? user.email);
}

function UserAvatar({
  user,
  displayName,
  className,
  fallbackClassName,
}: {
  user: AuthUser;
  displayName: string;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {user.image != null && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback
        className={cn("text-xs font-semibold", fallbackClassName)}
      >
        {initials(displayName) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The account menu: the User's name and email, and Sign out. `trigger` is
 * the button that opens it (the avatar in the top bar, `…` in the sidebar).
 */
function AccountMenu({
  user,
  displayName,
  trigger,
}: {
  user: AuthUser;
  displayName: string;
  trigger: ReactElement;
}) {
  const { signOut, fetchStatus } = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
            <span className="text-foreground block truncate text-sm font-semibold">
              {displayName}
            </span>
            <span className="text-muted-foreground block truncate text-xs font-normal">
              {user.email}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={fetchStatus === "fetching"}
          onClick={() => {
            void signOut();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The avatar menu in the top bar. On desktop the account lives in the
 * sidebar (ADR-0049), so AppShell shows this one on a phone only.
 */
export function UserMenu() {
  const { user } = useUser();
  if (user == null) return null;
  const displayName = displayNameOf(user);

  return (
    <AccountMenu
      user={user}
      displayName={displayName}
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label={`Account menu for ${displayName}`}
        >
          <UserAvatar
            user={user}
            displayName={displayName}
            className="size-8"
            fallbackClassName="bg-primary/10 text-primary"
          />
        </Button>
      }
    />
  );
}

/**
 * The account row at the top of the sidebar: avatar, name, email and the
 * `…` account menu. Without a User it shows the Whiteboard mark instead.
 */
export function SidebarUserAccount() {
  const { user } = useUser();

  if (user == null) {
    return (
      <SidebarAccount
        avatar={
          <Image
            src="/whiteboard-logo.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-xl"
          />
        }
        name="Whiteboard"
      />
    );
  }

  const displayName = displayNameOf(user);
  return (
    <SidebarAccount
      avatar={
        <UserAvatar
          user={user}
          displayName={displayName}
          className="size-9 shrink-0"
          fallbackClassName="bg-sidebar-primary text-sidebar-primary-foreground"
        />
      }
      name={displayName}
      detail={user.email}
      action={
        <AccountMenu
          user={user}
          displayName={displayName}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground shrink-0"
              aria-label={`Account menu for ${displayName}`}
            >
              <Ellipsis />
            </Button>
          }
        />
      }
    />
  );
}
