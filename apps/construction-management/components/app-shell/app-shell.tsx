"use client";

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
import { BrandMark } from "./brand-mark";
import { CompanySwitcher } from "./company-switcher";
import { PlanBanner } from "./plan-banner";
import { UserMenu } from "./user-menu";

/** Authenticated chrome: the three areas, the Active Company, the account menu. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/app";

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="offcanvas">
        <SidebarHeader className="border-sidebar-border border-b px-4 pt-5 pb-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Construction Management"
                render={<Link href="/app/projects" />}
              >
                <BrandMark />
                <span className="text-sidebar-foreground truncate text-base leading-tight font-semibold tracking-tight">
                  Construction
                  <br />
                  Management
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="px-3 pt-5">
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu className="gap-1">
                  {APP_NAV.map((item) => {
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
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 px-4 print:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <CompanySwitcher />
          <div className="ml-auto">
            <UserMenu />
          </div>
        </header>
        <PlanBanner />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
