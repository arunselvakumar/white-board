"use client";

import { useAuth, useWorkspace, useWorkspaceList } from "@repo/auth/react";
import { Building2 } from "lucide-react";
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

import { APP_NAV_ICONS } from "./app-nav-icons";
import { AppBreadcrumbs } from "./app-breadcrumbs";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const NAV_BUTTON_CLASS =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary h-10 gap-3 rounded-xl px-3 transition-colors data-active:shadow-[inset_0_0_0_1px_var(--sidebar-border)] [&_svg]:size-[18px]";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { workspace } = useWorkspace();
  const { workspaces } = useWorkspaceList();
  const { role } = useAuth();
  const workspaceName = workspace?.name ?? "Workspace";
  const navigation = navForRole(role);

  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="offcanvas">
        <SidebarHeader className="px-4 pt-6 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Whiteboard"
                render={<Link href="/" />}
              >
                <Image
                  src="/whiteboard-logo.svg"
                  alt=""
                  width={36}
                  height={36}
                  className="size-9"
                />
                <span className="text-sidebar-foreground truncate text-lg font-semibold tracking-tight">
                  Whiteboard
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-4">
            <SidebarGroupLabel className="text-sidebar-foreground/65 px-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
              Main menu
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
                          className={NAV_BUTTON_CLASS}
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
        <SidebarFooter className="border-sidebar-border mx-3 border-t px-0 pt-3 pb-4">
          <ThemeToggle />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="bg-card/85 border-border/70 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:px-6 print:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
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
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <div className="px-4 pt-4 sm:px-6 print:hidden">
          <AppBreadcrumbs />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
