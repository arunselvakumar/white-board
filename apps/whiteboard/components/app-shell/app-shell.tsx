"use client";

import {
  UserButton,
  useAuth,
  useOrganization,
  useOrganizationList,
} from "@clerk/nextjs";
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { organization } = useOrganization();
  const { userMemberships } = useOrganizationList({ userMemberships: true });
  const { orgRole } = useAuth();
  const workspaceName = organization?.name ?? "Workspace";
  const navigation = navForRole(orgRole);

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="px-4 pt-4 pb-3">
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
                <span className="truncate text-base font-semibold tracking-tight">
                  Whiteboard
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3">
            <SidebarGroupLabel className="px-3 text-[11px] font-semibold tracking-[0.12em] text-white/70">
              SESSIONS
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu>
                  {navigation.map((item) => {
                    const Icon = APP_NAV_ICONS[item.href];
                    const active = isAppNavActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          aria-current={active ? "page" : undefined}
                          className="h-10 rounded-lg px-3 text-white/90 hover:text-white data-[active=true]:text-white"
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
          {(userMemberships.count ?? 0) > 1 && (
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/select-workspace" />}
            >
              Switch Workspace
            </Button>
          )}
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>
        <div className="border-b px-6 py-2.5 print:hidden">
          <AppBreadcrumbs />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
