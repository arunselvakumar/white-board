"use client";

import {
  useCompanySignOut,
  useCompanyUser,
} from "@repo/auth/construction/react";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
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

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]];
  return letters
    .map((part) => part?.slice(0, 1) ?? "")
    .join("")
    .toUpperCase();
}

/** The signed-in User's name and email, and Sign out. */
export function UserMenu() {
  const { user } = useCompanyUser();
  const { signOut, fetchStatus } = useCompanySignOut();
  if (user == null) return null;
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
