"use client";

import { CreditCard, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Separator } from "@repo/ui/components/separator";
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
  useSidebar,
} from "@repo/ui/components/sidebar";

import { APP_NAV, isAppNavActive } from "@/lib/app-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";
import { BrandMark } from "./brand-mark";
import { CompanySwitcher } from "./company-switcher";
import { MastersNavMenu } from "./masters-nav-menu";
import { PlanBanner } from "./plan-banner";
import { UserMenu } from "./user-menu";

const NAV_BUTTON_CLASS =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary h-10 gap-3 rounded-xl px-3 transition-colors data-active:shadow-[inset_0_0_0_1px_var(--sidebar-border)] [&_svg]:size-[18px]";

/** Account pages that sit at the foot of the sidebar, below the areas. */
const FOOTER_LINKS = [
  { href: "/app/profile", label: "My Profile", icon: UserRound },
  { href: "/app/subscription", label: "Your Subscription", icon: CreditCard },
] as const;

/** Authenticated chrome: the three areas, the Active Company, the account menu. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/app";

  return (
    <SidebarProvider>
      <CloseMobileSidebarOnNavigate pathname={pathname} />
      <Sidebar variant="sidebar" collapsible="offcanvas">
        <SidebarHeader className="px-4 pt-6 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="Construction Management"
                render={<Link href="/app/projects" />}
              >
                <BrandMark className="size-9 rounded-xl" />
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
          <SidebarGroup className="px-3 pt-4">
            <SidebarGroupLabel className="text-sidebar-foreground/65 px-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
              Main menu
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <nav aria-label="Main">
                <SidebarMenu className="gap-1">
                  {APP_NAV.map((item) => {
                    if (item.href === "/app/masters")
                      return (
                        <MastersNavMenu
                          key={item.href}
                          pathname={pathname}
                          buttonClassName={NAV_BUTTON_CLASS}
                        />
                      );
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
          <SidebarMenu className="gap-1">
            {FOOTER_LINKS.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={item.label}
                    aria-current={active ? "page" : undefined}
                    className={NAV_BUTTON_CLASS}
                    render={<Link href={item.href} />}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="bg-card/85 border-border/70 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:px-6 print:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
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

/** On a phone the sidebar is a sheet; close it once a link has navigated. */
function CloseMobileSidebarOnNavigate({ pathname }: { pathname: string }) {
  const { setOpenMobile } = useSidebar();
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);
  return null;
}
