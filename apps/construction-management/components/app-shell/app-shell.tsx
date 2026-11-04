"use client";

import { useCompanySignOut } from "@repo/auth/construction/react";
import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  SidebarFootnote,
  SidebarPhoneBar,
  SidebarReopenTrigger,
  SidebarSearch,
  SidebarSectionLabel,
} from "@repo/ui/components/sidebar-chrome";
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

import { NotificationBell } from "@/components/notifications/notification-bell";
import { ReadyDownloadToast } from "@/components/notifications/ready-download-toast";
import { APP_NAV, isAppNavActive } from "@/lib/app-nav";
import { MASTERS_GROUPS } from "@/lib/masters-nav";
import { projectIdFromPath } from "@/lib/project-nav";

import { APP_NAV_ICONS } from "./app-nav-icons";
import type { AreaNavGroup } from "./area-nav-menu";
import { BrandMark } from "./brand-mark";
import { CompanySwitcher } from "./company-switcher";
import {
  HumanResourcesNavMenu,
  humanResourcesGroups,
} from "./human-resources-nav-menu";
import { MastersNavMenu } from "./masters-nav-menu";
import { CompanyDeletionBanner } from "./company-deletion-banner";
import {
  filterMenuArea,
  labelMatches,
  menuQuery,
  noMatchMessage,
  type AreaMatch,
} from "./menu-filter";
import { PlanBanner } from "./plan-banner";
import { ProjectNavMenu } from "./project-nav-menu";
import { SidebarAccountRow } from "./sidebar-account-row";
import { SidebarPlanCard } from "./sidebar-plan-card";
import { WORKSPACE_GROUPS, WorkspaceNavMenu } from "./workspace-nav-menu";

/**
 * A sidebar row (ADR-0049): muted on the ink panel, the primary pill when
 * current. No hover background of its own: the `SidebarGlide` pill moves
 * under the hovered row (ADR-0050).
 */
const NAV_BUTTON_CLASS =
  "text-sidebar-foreground/70 hover:bg-transparent hover:text-sidebar-foreground data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:[&_svg]:text-sidebar-primary-foreground data-active:font-semibold h-10 gap-3 rounded-xl px-3 transition-colors [&_svg]:size-[18px] [&_svg]:text-sidebar-foreground/65 hover:[&_svg]:text-sidebar-foreground";

/** From package.json at build time (next.config.ts), so the browser never gets the dependency list. */
const VERSION = `v${process.env["NEXT_PUBLIC_APP_VERSION"] ?? "0.0.0"}`;

/**
 * Authenticated chrome (ADR-0049, ADR-0050): the ink sidebar carries it
 * all, with no top bar from `md` up: the Company switcher, the User's
 * account row with the notification bell, the menu search, the Company
 * Dashboard, Projects, Human Resources, Workspace, Masters and Settings,
 * then the plan card, My Profile and Sign out. On a phone a slim bar opens
 * the sidebar sheet and keeps the bell in reach. Inside a Project the areas give way to the Project's own
 * menu (ADR CM-0020). `canOpenDashboard` is the Dashboard menu's Read flag
 * (CM-902): without it the Dashboard is not in the menu.
 * `canOpenStaffRoles` is Team Members or Role Management Read (ADR
 * CM-0030): without either, the Staff group of Human Resources is not (ADR
 * CM-0034).
 */
export function AppShell({
  children,
  canOpenDashboard = false,
  canOpenStaffRoles = true,
}: {
  children: ReactNode;
  canOpenDashboard?: boolean;
  canOpenStaffRoles?: boolean;
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
          <CompanySwitcher />
          <SidebarAccountRow />
          <SidebarSearch
            aria-label="Search menu"
            placeholder="Search menu…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGlide>
            {projectId == null ? (
              <MainMenu
                pathname={pathname}
                query={query}
                canOpenDashboard={canOpenDashboard}
                canOpenStaffRoles={canOpenStaffRoles}
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
      <SidebarInset className="min-w-0">
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
 * The foot of the sidebar, below the plan card: My Profile, then Sign out.
 * Your Subscription is the plan card's link. Outside the Main navigation:
 * Sign out is an action, not a page.
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

type MainMenuRow = {
  item: (typeof APP_NAV)[number];
  /** An area's groups under the menu search; null for a plain row. */
  match: AreaMatch<AreaNavGroup> | null;
};

/** The areas with a submenu, by their main-menu link. */
function areaGroups(
  href: string,
  canOpenStaffRoles: boolean,
): readonly AreaNavGroup[] | undefined {
  switch (href) {
    case "/app/staff":
      return humanResourcesGroups(canOpenStaffRoles);
    case "/app/workspace":
      return WORKSPACE_GROUPS;
    case "/app/masters":
      return MASTERS_GROUPS;
    default:
      return undefined;
  }
}

/**
 * The Company Dashboard (with Dashboard Read), Projects, then the areas
 * with a submenu each: Human Resources, Workspace and Masters, then
 * Settings (ADR CM-0034). The menu search narrows it (`menu-filter.ts`).
 */
function MainMenu({
  pathname,
  query,
  canOpenDashboard,
  canOpenStaffRoles,
}: {
  pathname: string;
  query: string;
  canOpenDashboard: boolean;
  canOpenStaffRoles: boolean;
}) {
  const q = menuQuery(query);
  const rows = APP_NAV.flatMap((item): MainMenuRow[] => {
    if (item.href === "/app/dashboard" && !canOpenDashboard) return [];
    const groups = areaGroups(item.href, canOpenStaffRoles);
    if (groups == null)
      return labelMatches(item.label, q) ? [{ item, match: null }] : [];
    const match = filterMenuArea(item.label, groups, q);
    return match == null ? [] : [{ item, match }];
  });

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
              {rows.map(({ item, match }) => {
                if (match != null) {
                  const area = {
                    pathname,
                    buttonClassName: NAV_BUTTON_CLASS,
                    groups: match.groups,
                    forceOpen: match.forceOpen,
                  };
                  if (item.href === "/app/masters")
                    return <MastersNavMenu key={item.href} {...area} />;
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
