"use client";

import { Ellipsis } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { SidebarAccount } from "@repo/ui/components/sidebar-chrome";

import { BrandMark } from "./brand-mark";
import { AccountAvatar, UserMenuContent, useAccount } from "./user-menu";

/**
 * The top of the sidebar (ADR-0049): the signed-in User's avatar, name and
 * email, and `…` for the account menu. Nobody signed in: the product mark
 * and name, with no menu.
 */
export function SidebarAccountRow() {
  const account = useAccount();
  if (account == null)
    return (
      <SidebarAccount
        avatar={<BrandMark className="size-9 rounded-xl" />}
        name="Construction Management"
      />
    );

  return (
    <SidebarAccount
      avatar={
        <AccountAvatar
          photo={account.photo}
          displayName={account.displayName}
          className="size-9"
          fallbackClassName="bg-sidebar-primary text-sidebar-primary-foreground"
        />
      }
      name={account.displayName}
      detail={account.email}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-foreground shrink-0"
                aria-label={`Account menu for ${account.displayName}`}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <UserMenuContent
            displayName={account.displayName}
            email={account.email}
          />
        </DropdownMenu>
      }
    />
  );
}
