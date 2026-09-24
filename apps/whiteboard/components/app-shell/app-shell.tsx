"use client";

import { UserButton, useOrganization } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Separator } from "@repo/ui/components/separator";
import {
  Sidebar,
  SidebarContent,
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

import { APP_NAV, isAppNavActive } from "@/lib/app-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { organization } = useOrganization();
  const workspaceName = organization?.name ?? "Workspace";

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader>
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
                  width={32}
                  height={32}
                  className="size-8"
                />
                <span className="truncate text-sm tracking-tight">
                  Whiteboard
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu>
                  {APP_NAV.map((item) => {
                    const Icon = APP_NAV_ICONS[item.href];
                    const active = isAppNavActive(pathname, item.href);
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          isActive={active}
                          tooltip={item.label}
                          aria-current={active ? "page" : undefined}
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
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <p className="text-muted-foreground truncate text-sm font-light">
            {workspaceName}
          </p>
          <div className="ml-auto">
            <UserButton />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
