"use client";

import { CreditCard, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Separator } from "@repo/ui/components/separator";
import { SkipLink } from "@repo/ui/components/skip-link";
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

import { NotificationBell } from "@/components/notifications/notification-bell";
import { ReadyDownloadToast } from "@/components/notifications/ready-download-toast";
import { APP_NAV, isAppNavActive } from "@/lib/app-nav";
import { projectIdFromPath } from "@/lib/project-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";
import { BrandMark } from "./brand-mark";
import { CompanySwitcher } from "./company-switcher";
import { MastersNavMenu } from "./masters-nav-menu";
import { PlanBanner } from "./plan-banner";
import { ProjectNavMenu } from "./project-nav-menu";
import { UserMenu } from "./user-menu";
import { WorkspaceNavMenu } from "./workspace-nav-menu";

const NAV_BUTTON_CLASS =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:text-sidebar-foreground data-active:[&_svg]:text-sidebar-primary h-10 gap-3 rounded-xl px-3 transition-colors data-active:shadow-[inset_0_0_0_1px_var(--sidebar-border)] [&_svg]:size-[18px]";

/** Account pages that sit at the foot of the sidebar, below the areas. */
const FOOTER_LINKS = [
  { href: "/app/profile", label: "My Profile", icon: UserRound },
  { href: "/app/subscription", label: "Your Subscription", icon: CreditCard },
] as const;

/**
 * Authenticated chrome: the Company Dashboard and the three areas, the
 * Active Company, the account menu. Inside a Project the areas give way to
 * the Project's own menu (ADR CM-0020). `canOpenDashboard` is the
 * Dashboard menu's Read flag (CM-902): without it the Dashboard is not in
 * the menu.
 */
export function AppShell({
  children,
  canOpenDashboard = false,
}: {
  children: ReactNode;
  canOpenDashboard?: boolean;
}) {
  const pathname = usePathname() || "/app";
  const projectId = projectIdFromPath(pathname);

  return (
    <SidebarProvider>
      <SkipLink />
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
          {projectId == null ? (
            <MainMenu pathname={pathname} canOpenDashboard={canOpenDashboard} />
          ) : (
            <ProjectNavMenu
              projectId={projectId}
              pathname={pathname}
              buttonClassName={NAV_BUTTON_CLASS}
            />
          )}
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
      {/* min-w-0: a wide child (a table, a chart) scrolls inside
          itself instead of widening the page past the sidebar. */}
      <SidebarInset className="min-w-0">
        <header className="bg-card/85 border-border/70 sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur sm:px-6 print:hidden">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <CompanySwitcher />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <PlanBanner />
        {/* tabIndex -1: Skip to content can move focus here without adding a Tab stop. */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
        <ReadyDownloadToast />
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * The Company Dashboard (with Dashboard Read), then the three areas:
 * Projects, Workspace (with its submenu) and Masters.
 */
function MainMenu({
  pathname,
  canOpenDashboard,
}: {
  pathname: string;
  canOpenDashboard: boolean;
}) {
  return (
    <SidebarGroup className="px-3 pt-4">
      <SidebarGroupLabel className="text-sidebar-foreground/65 px-3 text-[11px] font-semibold tracking-[0.12em] uppercase">
        Main menu
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <nav aria-label="Main">
          <SidebarMenu className="gap-1">
            {APP_NAV.map((item) => {
              if (item.href === "/app/dashboard" && !canOpenDashboard)
                return null;
              if (item.href === "/app/masters")
                return (
                  <MastersNavMenu
                    key={item.href}
                    pathname={pathname}
                    buttonClassName={NAV_BUTTON_CLASS}
                  />
                );
              if (item.href === "/app/workspace")
                return (
                  <WorkspaceNavMenu
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
