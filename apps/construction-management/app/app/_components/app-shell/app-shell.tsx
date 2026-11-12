"use client";

import { useCompanySignOut } from "@repo/auth/construction/react";
import { LayoutGrid, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  SidebarFootnote,
  SidebarPhoneBar,
  SidebarReopenTrigger,
  SidebarSearch,
  SidebarSectionLabel,
} from "@repo/ui/components/sidebar-chrome";
import { Button } from "@repo/ui/components/button";
import { SidebarGlide } from "@repo/ui/components/sidebar-glide";
import { SkipLink } from "@repo/ui/components/skip-link";
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
  useSidebar,
} from "@repo/ui/components/sidebar";

import { NotificationBell } from "@/app/app/_components/notifications/notification-bell";
import { ReadyDownloadToast } from "@/app/app/_components/notifications/ready-download-toast";
import { isAppNavActive } from "@/lib/app-nav";
import {
  NO_MARKETING_ACCESS,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";
import { projectIdFromPath } from "@/lib/project-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { HumanResourcesNavMenu } from "./human-resources-nav-menu";
import { MastersNavMenu } from "./masters-nav-menu";
import { NAV_BUTTON_CLASS } from "./nav-button-class";
import { CompanyDeletionBanner } from "./company-deletion-banner";
import { HOME_PATH, filterMainMenu, mainMenuAreas } from "./main-menu-areas";
import { MarketingNavMenu } from "./marketing-nav-menu";
import { setMenuLayout, useMenuLayout } from "./menu-layout";
import { MenuTopBar } from "./menu-top-bar";
import { menuQuery, noMatchMessage } from "./menu-filter";
import { PlanBanner } from "./plan-banner";
import { ProjectNavMenu } from "./project-nav-menu";
import { SidebarAccountRow } from "./sidebar-account-row";
import { SidebarPlanCard } from "./sidebar-plan-card";
import { SwitchCompany } from "./switch-company";
import { WorkspaceNavMenu } from "./workspace-nav-menu";

/** From package.json at build time (next.config.ts), so the browser never gets the dependency list. */
const VERSION = `v${process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.0.0"}`;

/**
 * Authenticated chrome (ADR-0049, ADR-0050): the ink sidebar carries it
 * all, with no top bar from `md` up: the User's account row with the
 * notification bell, the menu search, the Company Dashboard, Projects,
 * Marketing, Human Resources, Workspace, Masters and Settings, then the plan card, My
 * Profile, Switch Company (ADR-0051) and Sign out. On a phone a slim bar
 * opens the sidebar sheet and keeps the bell in reach. Inside a Project the
 * areas give way to the Project's own menu (ADR CM-0020). A User who
 * picked the full-page menu (ADR CM-0039) gets a top bar in the sidebar's
 * ink and no sidebar, outside a Project: the main menu is then a page.
 * `canOpenDashboard` is the Dashboard menu's Read flag: without it the
 * Dashboard is not in the menu. `canOpenStaffRoles` is Team Members or Role
 * Management Read (ADR CM-0030): without either, Office Staff and Role
 * Management are not in the Staff group of Human Resources (ADR CM-0034).
 * `marketing` is the Marketing entries the Role opens: with none, Marketing
 * is not in the menu (ADR CM-0040).
 */
export function AppShell({
  children,
  canOpenDashboard = false,
  canOpenStaffRoles = true,
  marketing = NO_MARKETING_ACCESS,
}: {
  children: ReactNode;
  canOpenDashboard?: boolean;
  canOpenStaffRoles?: boolean;
  marketing?: MarketingMenuAccess;
}) {
  const pathname = usePathname() || "/app";
  const projectId = projectIdFromPath(pathname);
  const [query, setQuery] = useState("");
  // Picking a row clears the search, so a query typed on the Main menu
  // does not hide every module of the Project opened next, and the phone
  // sheet never reopens cut down (state adjusted in render).
  const [queryPathname, setQueryPathname] = useState(pathname);
  if (queryPathname !== pathname) {
    setQueryPathname(pathname);
    setQuery("");
  }

  const layout = useMenuLayout();
  const router = useRouter();

  // Inside a Project the sidebar stays: it is the Project's own menu.
  if (layout === "full" && projectId == null)
    return (
      // The provider is for Switch Company's row, a sidebar menu button.
      <SidebarProvider className="bg-background flex-col">
        <SkipLink />
        <MenuTopBar pathname={pathname} />
        <PlanBanner />
        <CompanyDeletionBanner />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex min-w-0 flex-1 flex-col outline-none"
        >
          {children}
        </main>
        <ReadyDownloadToast />
      </SidebarProvider>
    );

  return (
    <SidebarProvider style={{ "--sidebar-width": "17.5rem" } as CSSProperties}>
      <SkipLink />
      <CloseMobileSidebarOnNavigate pathname={pathname} />
      <Sidebar
        variant="floating"
        collapsible="offcanvas"
        className="[&_[data-slot=sidebar-inner]]:ring-sidebar-border p-3 [&_[data-slot=sidebar-inner]]:rounded-2xl"
      >
        <SidebarHeader className="gap-3 px-3 pt-4 pb-2">
          <SidebarAccountRow />
          <div className="flex items-center gap-1.5">
            <div className="min-w-0 flex-1">
              <SidebarSearch
                aria-label="Search menu"
                placeholder="Search menu…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground size-10 shrink-0 rounded-full"
              aria-label="Show the menu on a full page"
              title="Full-page menu"
              onClick={() => {
                setMenuLayout("full");
                router.push(HOME_PATH);
              }}
            >
              <LayoutGrid aria-hidden="true" />
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGlide>
            {projectId == null ? (
              <MainMenu
                pathname={pathname}
                query={query}
                canOpenDashboard={canOpenDashboard}
                canOpenStaffRoles={canOpenStaffRoles}
                marketing={marketing}
              />
            ) : (
              <ProjectNavMenu
                projectId={projectId}
                pathname={pathname}
                query={query}
                buttonClassName={NAV_BUTTON_CLASS}
              />
            )}
          </SidebarGlide>
        </SidebarContent>
        <SidebarFooter className="gap-2 px-3 pt-2 pb-3">
          <SidebarPlanCard />
          <FooterMenu pathname={pathname} />
          <SidebarFootnote>{VERSION}</SidebarFootnote>
        </SidebarFooter>
      </Sidebar>
      {/* min-w-0: a wide child (a table, a chart) scrolls inside
          itself instead of widening the page past the sidebar. */}
      {/* Room for SidebarReopenTrigger while the sidebar is collapsed (ADR-0050). */}
      <SidebarInset className="min-w-0 md:peer-data-[state=collapsed]:pl-12">
        {/* Below md only: from md up the sidebar carries the shell (ADR-0050). */}
        <SidebarReopenTrigger />
        <SidebarPhoneBar className="top-(--impersonation-bar)">
          <BrandMark className="size-7 rounded-lg" />
          <span className="min-w-0 truncate text-sm font-semibold">
            Construction Management
          </span>
          <div className="ml-auto flex shrink-0 items-center">
            <NotificationBell />
          </div>
        </SidebarPhoneBar>
        <PlanBanner />
        <CompanyDeletionBanner />
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
 * The foot of the sidebar, below the plan card: My Profile, Switch Company,
 * then Sign out. Your Subscription is the plan card's link. Outside the Main
 * navigation: the last two are actions, not pages.
 */
function FooterMenu({ pathname }: { pathname: string }) {
  const { signOut, fetchStatus } = useCompanySignOut();
  const profileHref = "/app/profile";
  const onProfile =
    pathname === profileHref || pathname.startsWith(`${profileHref}/`);
  return (
    <SidebarGlide className="flex-none">
      <SidebarMenu className="gap-1">
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={onProfile}
            tooltip="My Profile"
            aria-current={onProfile ? "page" : undefined}
            className={NAV_BUTTON_CLASS}
            render={<Link href={profileHref} />}
          >
            <UserRound />
            <span className="min-w-0 flex-1 truncate">My Profile</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SwitchCompany rowClassName={NAV_BUTTON_CLASS} />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Sign out"
            className={NAV_BUTTON_CLASS}
            disabled={fetchStatus === "fetching"}
            onClick={() => {
              void signOut();
            }}
          >
            <LogOut />
            <span className="min-w-0 flex-1 truncate">Sign out</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGlide>
  );
}

/**
 * The Company Dashboard (with Dashboard Read), Projects, then the areas
 * with a submenu each: Marketing (with an entry the Role opens, ADR
 * CM-0040), Human Resources, Workspace and Masters, then Settings (ADR
 * CM-0034). The menu search narrows it (`menu-filter.ts`).
 */
function MainMenu({
  pathname,
  query,
  canOpenDashboard,
  canOpenStaffRoles,
  marketing,
}: {
  pathname: string;
  query: string;
  canOpenDashboard: boolean;
  canOpenStaffRoles: boolean;
  marketing: MarketingMenuAccess;
}) {
  const q = menuQuery(query);
  const rows = filterMainMenu(
    mainMenuAreas({ canOpenDashboard, canOpenStaffRoles, marketing }),
    q,
  );

  return (
    <SidebarGroup className="px-3 pt-2">
      <SidebarSectionLabel>Main menu</SidebarSectionLabel>
      <SidebarGroupContent>
        <nav aria-label="Main">
          {rows.length === 0 ? (
            <p className="text-sidebar-foreground/55 px-3 py-2 text-sm">
              {noMatchMessage(query)}
            </p>
          ) : (
            <SidebarMenu className="gap-1">
              {rows.map(({ area: { item }, match }) => {
                if (match != null) {
                  const area = {
                    pathname,
                    buttonClassName: NAV_BUTTON_CLASS,
                    groups: match.groups,
                    forceOpen: match.forceOpen,
                  };
                  if (item.href === "/app/masters")
                    return <MastersNavMenu key={item.href} {...area} />;
                  if (item.href === "/app/marketing")
                    return (
                      <MarketingNavMenu
                        key={item.href}
                        {...area}
                        access={marketing}
                      />
                    );
                  if (item.href === "/app/staff")
                    return (
                      <HumanResourcesNavMenu
                        key={item.href}
                        {...area}
                        canOpenStaffRoles={canOpenStaffRoles}
                      />
                    );
                  return <WorkspaceNavMenu key={item.href} {...area} />;
                }
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
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          )}
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
