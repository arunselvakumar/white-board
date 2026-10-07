"use client";

import { useAuth, useWorkspace, useWorkspaceList } from "@repo/auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Separator } from "@repo/ui/components/separator";
import { Button } from "@repo/ui/components/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@repo/ui/components/sidebar";

import { isAppNavActive, navForRole } from "@/lib/app-nav";
import { withAppBasePath } from "@/lib/app-base-path";

import { APP_NAV_ICONS } from "./app-nav-icons";
import { AppBreadcrumbs } from "./app-breadcrumbs";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { workspace } = useWorkspace();
  const { workspaces } = useWorkspaceList();
  const { role } = useAuth();
  const workspaceName = workspace?.name ?? "Workspace";
  const navigation = navForRole(role);

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="border-sidebar-border border-b px-4 pt-5 pb-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Whiteboard"
                render={<Link href="/" />}
              >
                <Image
                  src={withAppBasePath("/whiteboard-logo.svg")}
                  alt=""
                  width={32}
                  height={32}
                  className="size-8"
                />
                <span className="text-sidebar-foreground truncate text-base font-semibold tracking-tight">
                  Whiteboard
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-5">
            <SidebarGroupLabel className="text-sidebar-foreground/55 px-3 text-[11px] font-semibold tracking-[0.12em]">
              SESSIONS
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu className="gap-1">
                  {navigation.map((item) => {
                    const Icon = APP_NAV_ICONS[item.href];
                    const active = isAppNavActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          aria-current={active ? "page" : undefined}
                          className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground h-11 rounded-xl px-3 transition-colors data-active:shadow-[0_5px_16px_rgba(10,7,31,0.2)]"
                          render={<Link href={item.href} />}
                        >
                          <Icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="px-3 pb-4">
          <ThemeToggle />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4 print:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <p className="text-muted-foreground truncate text-sm font-light">
            {workspaceName}
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
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <div className="border-border/70 bg-secondary/45 border-b px-4 py-2.5 sm:px-6 print:hidden">
          <AppBreadcrumbs />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
