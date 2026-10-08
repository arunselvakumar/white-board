"use client";

import {
  useCompanyAuth,
  useCompanySignOut,
  useCompanyUser,
} from "@repo/auth/construction/react";
import { useQuery } from "@tanstack/react-query";
import { LogOut, UserRound } from "lucide-react";
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
 * The signed-in User's name and email, My Profile and Sign out. The avatar
 * shows their My Profile photo in the Active Company when they have one;
 * pass `photoUrl` to skip loading it (null for initials).
 */
export function UserMenu({ photoUrl }: { photoUrl?: string | null } = {}) {
  const { user } = useCompanyUser();
  const { workspaceId } = useCompanyAuth();
  const { signOut, fetchStatus } = useCompanySignOut();
  const { data: me } = useQuery({
    ...myProfileQuery,
    enabled: photoUrl === undefined && user != null && workspaceId != null,
    retry: false,
  });
  if (user == null) return null;
  const photo = photoUrl === undefined ? (me?.photoUrl ?? null) : photoUrl;
  const displayName =
    user.name.trim().length > 0 ? user.name.trim() : user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={`Account menu for ${displayName}`}
          />
        }
      >
        <Avatar className="size-8">
          {photo != null && <AvatarImage src={photo} alt="" />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {initials(displayName) || "?"}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
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
        <DropdownMenuItem render={<Link href="/app/profile" />}>
          <UserRound />
          My Profile
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
    </DropdownMenu>
  );
}
