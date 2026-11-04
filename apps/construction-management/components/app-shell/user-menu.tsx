"use client";

import {
  useCompanyAuth,
  useCompanySignOut,
  useCompanyUser,
} from "@repo/auth/construction/react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Download, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
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

import { myProfileQuery } from "@/src/queries/my-profile";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return letters
    .map((part) => part?.slice(0, 1) ?? "")
    .join("")
    .toUpperCase();
}

/**
 * The signed-in User for the account menu: their display name (their name,
 * else their email), email and avatar photo. The photo is their My Profile
 * photo in the Active Company when they have one; pass `photoUrl` to skip
 * loading it (null for initials). `null` when nobody is signed in.
 */
export function useAccount(photoUrl?: string | null) {
  const { user } = useCompanyUser();
  const { workspaceId } = useCompanyAuth();
  const { data: me } = useQuery({
    ...myProfileQuery,
    enabled: photoUrl === undefined && user != null && workspaceId != null,
    retry: false,
  });
  if (user == null) return null;
  const photo = photoUrl === undefined ? (me?.photoUrl ?? null) : photoUrl;
  const displayName =
    user.name.trim().length > 0 ? user.name.trim() : user.email;
  return { displayName, email: user.email, photo };
}

/** The User's photo, else their initials. */
export function AccountAvatar({
  photo,
  displayName,
  className,
  fallbackClassName = "bg-primary/10 text-primary",
}: {
  photo: string | null;
  displayName: string;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {photo != null && <AvatarImage src={photo} alt="" />}
      <AvatarFallback className={`${fallbackClassName} text-xs font-semibold`}>
        {initials(displayName) || "?"}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * The account menu's items: the User's name and email, My Profile,
 * Downloads (their reports across Projects, CM-901), Your Subscription and
 * Sign out. The top bar (on a phone) and the sidebar's account row each
 * open it from their own trigger.
 */
export function UserMenuContent({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const { signOut, fetchStatus } = useCompanySignOut();
  return (
    <DropdownMenuContent align="end" className="w-60">
      <DropdownMenuGroup>
        <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
          <span className="text-foreground block truncate text-sm font-semibold">
            {displayName}
          </span>
          <span className="text-muted-foreground block truncate text-xs font-normal">
            {email}
          </span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem render={<Link href="/app/profile" />}>
        <UserRound />
        My Profile
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href="/app/downloads" />}>
        <Download />
        Downloads
      </DropdownMenuItem>
      <DropdownMenuItem render={<Link href="/app/subscription" />}>
        <CreditCard />
        Your Subscription
      </DropdownMenuItem>
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
  );
}

/**
 * The account menu behind the User's avatar. The shell shows it in the top
 * bar on a phone only; on a wide screen the sidebar's account row opens
 * the same menu (ADR-0049).
 */
export function UserMenu({ photoUrl }: { photoUrl?: string | null } = {}) {
  const account = useAccount(photoUrl);
  if (account == null) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={`Account menu for ${account.displayName}`}
          />
        }
      >
        <AccountAvatar
          photo={account.photo}
          displayName={account.displayName}
          className="size-8"
        />
      </DropdownMenuTrigger>
      <UserMenuContent
        displayName={account.displayName}
        email={account.email}
      />
    </DropdownMenu>
  );
}
