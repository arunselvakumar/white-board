"use client";

import { useWorkspace, useWorkspaceList } from "@repo/auth/react";
import { Check } from "lucide-react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { SidebarSwitcher } from "@repo/ui/components/sidebar-chrome";

const SWITCH_ERROR = "Could not switch to that Workspace. Please try again.";

/**
 * The first row of the sidebar (ADR-0050): the Whiteboard mark, the Active
 * Workspace, and a menu of the User's Workspaces. Picking another one makes
 * it the Active Workspace and reloads at the Dashboard; with one Workspace
 * the menu still opens and shows it. A switch that fails says so under
 * the row, as Workspace Selection does.
 */
export function WorkspaceSwitcher() {
  const { workspace } = useWorkspace();
  const { workspaces, setActive, fetchStatus, error } = useWorkspaceList();
  const name = workspace?.name ?? "Workspace";
  const switching = fetchStatus === "fetching";

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarSwitcher
              mark={
                <Image
                  src="/whiteboard-logo.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 shrink-0 rounded-xl"
                />
              }
              name={name}
              detail="Whiteboard"
              aria-label={`Active Workspace: ${name}. Switch Workspace`}
            />
          }
        />
        <DropdownMenuContent
          align="start"
          className="w-(--anchor-width) min-w-56"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Your Workspaces</DropdownMenuLabel>
            {workspaces.map((item) => {
              const active = item.id === workspace?.id;
              return (
                <DropdownMenuItem
                  key={item.id}
                  disabled={switching}
                  onClick={() => {
                    // setActive reloads the app at "/" once the switch lands.
                    if (!active) void setActive(item.id, "/");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {active && (
                    <Check
                      aria-label="Active"
                      className="text-primary size-4"
                    />
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {error != null && (
        <p role="alert" className="text-destructive px-2 text-xs">
          {SWITCH_ERROR}
        </p>
      )}
    </div>
  );
}
