"use client";

import {
  useAuth,
  useSignOut,
  useUser,
  useWorkspace,
  useWorkspaceList,
} from "@repo/auth/react";
import { Building2, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Separator } from "@repo/ui/components/separator";
import { SkipLink } from "@repo/ui/components/skip-link";
import { Button } from "@repo/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@repo/ui/components/sidebar";
import {
  SidebarFootnote,
  SidebarSearch,
  SidebarSectionLabel,
} from "@repo/ui/components/sidebar-chrome";

import { NotificationBell } from "@/components/notifications/notification-bell";
import { navForRole } from "@/lib/app-nav";

/** From package.json at build time (next.config.ts), so the browser never gets the dependency list. */
const VERSION = `v${process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.0.0"}`;

import { AppBreadcrumbs } from "./app-breadcrumbs";
import { SIDEBAR_ROW_CLASS, SidebarMainNav } from "./sidebar-nav";
import { SidebarTodayCard } from "./sidebar-today-card";
import { ThemeToggle } from "./theme-toggle";
import { SidebarUserAccount, UserMenu } from "./user-menu";

/** Sign out, the last row of the sidebar. */
function SidebarSignOut() {
  const { user } = useUser();
  const { signOut, fetchStatus } = useSignOut();
  if (user == null) return null;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={SIDEBAR_ROW_CLASS}
        disabled={fetchStatus === "fetching"}
        onClick={() => {
          void signOut();
        }}
      >
        <LogOut />
        <span className="min-w-0 flex-1 truncate">Sign out</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { workspace } = useWorkspace();
  const { workspaces } = useWorkspaceList();
  const { role } = useAuth();
  const pathname = usePathname() || "/";
  const [menuQuery, setMenuQuery] = useState("");
  // Picking a row clears the search, so the next time the menu opens (the
  // phone sheet, say) nothing looks missing (state adjusted in render).
  const [queryPathname, setQueryPathname] = useState(pathname);
  if (queryPathname !== pathname) {
    setQueryPathname(pathname);
    setMenuQuery("");
  }
  const workspaceName = workspace?.name ?? "Workspace";
  const navigation = navForRole(role);

  return (
    <SidebarProvider style={{ "--sidebar-width": "17.5rem" } as CSSProperties}>
      <SkipLink />
      <Sidebar
        variant="floating"
        collapsible="offcanvas"
        className="[&_[data-slot=sidebar-inner]]:ring-sidebar-border p-3 [&_[data-slot=sidebar-inner]]:rounded-2xl"
      >
        <SidebarHeader className="gap-3 px-3 pt-4 pb-2">
          <SidebarUserAccount />
          <SidebarSearch
            aria-label="Search menu"
            placeholder="Search menu…"
            value={menuQuery}
            onChange={(event) => {
              setMenuQuery(event.target.value);
            }}
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-2">
            <SidebarSectionLabel>Main menu</SidebarSectionLabel>
            <SidebarGroupContent>
              <SidebarMainNav items={navigation} query={menuQuery} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 px-3 pt-2 pb-3">
          {role === "owner" ? <SidebarTodayCard /> : null}
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <ThemeToggle />
            </SidebarMenuItem>
            <SidebarSignOut />
          </SidebarMenu>
          <SidebarFootnote>{VERSION}</SidebarFootnote>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="bg-card/85 border-border/70 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:px-6 print:hidden">
          <SidebarTrigger />
          <p className="text-foreground flex shrink-0 items-center gap-2">
            <Image
              src="/whiteboard-logo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 rounded-lg"
            />
            <span className="hidden text-sm font-semibold sm:inline">
              Whiteboard
            </span>
          </p>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <p className="text-foreground flex min-w-0 items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg"
            >
              <Building2 className="size-4" />
            </span>
            <span className="truncate">{workspaceName}</span>
          </p>
          {workspaces.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/select-workspace" />}
            >
              Switch Workspace
            </Button>
          )}
          <div className="ml-auto flex items-center gap-1">
            {/* Only Teachers receive Notifications for now (ADR-0041 §1). */}
            {role === "teacher" ? <NotificationBell /> : null}
            {/* On desktop the account menu lives in the sidebar (ADR-0049). */}
            <div className="md:hidden">
              <UserMenu />
            </div>
          </div>
        </header>
        <div className="px-4 pt-4 sm:px-6 print:hidden">
          <AppBreadcrumbs />
        </div>
        {/* tabIndex -1: Skip to content can move focus here without adding a Tab stop. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
