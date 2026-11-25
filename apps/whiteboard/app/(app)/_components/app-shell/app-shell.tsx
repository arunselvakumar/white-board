"use client";

import { useAuth, useSignOut, useUser, useWorkspace } from "@repo/auth/react";
import { LogOut } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { SkipLink } from "@repo/ui/components/skip-link";
import { PAGE_WATERMARK_HOST_CLASS } from "@repo/ui/components/page-watermark";
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
} from "@repo/ui/components/sidebar";
import {
  SidebarPhoneBar,
  SidebarReopenTrigger,
  SidebarSearch,
  SidebarSectionLabel,
} from "@repo/ui/components/sidebar-chrome";
import { SidebarGlide } from "@repo/ui/components/sidebar-glide";

import { NotificationBell } from "@/app/(app)/_components/notifications/notification-bell";
import { navForRole } from "@/lib/app-nav";
import { isPreschool } from "@/lib/institution-type";

import { AppBreadcrumbs } from "./app-breadcrumbs";
import { PreschoolSidebarNav } from "./preschool-sidebar-nav";
import { SIDEBAR_ROW_CLASS, SidebarMainNav } from "./sidebar-nav";
import { SidebarTodayCard } from "./sidebar-today-card";
import { SwitchCentre } from "./switch-centre";
import { SwitchWorkspace } from "./switch-workspace";
import { ThemeToggle } from "./theme-toggle";
import { scrollFadeClass, useScrollFade } from "./use-scroll-fade";
import { SidebarUserAccount } from "./user-menu";

/** The bell on the sidebar's account row, in the sidebar's colours. */
const SIDEBAR_BELL_CLASS =
  "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground size-9 shrink-0 rounded-[min(var(--radius-md),12px)] [&>svg]:size-[18px] [&>[data-slot=notification-bell-count]]:ring-sidebar";

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

/**
 * The in-app chrome. The menu follows the Institution Type, then the role
 * (ADR-0055): a Preschool Workspace gets the Preschool menu and Switch
 * Centre, and none of the Training Institute pieces (the Today card, the
 * Notification bell), so it calls no Training Institute API.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const { workspace } = useWorkspace();
  const preschool = isPreschool(workspace?.institutionType);
  const teacherBell = role === "teacher" && !preschool;
  const { ref: menuRef, fade: menuFade } = useScrollFade<HTMLDivElement>();
  const pathname = usePathname() || "/";
  const [menuQuery, setMenuQuery] = useState("");
  // Picking a row clears the search, so the next time the menu opens (the
  // phone sheet, say) nothing looks missing (state adjusted in render).
  const [queryPathname, setQueryPathname] = useState(pathname);
  if (queryPathname !== pathname) {
    setQueryPathname(pathname);
    setMenuQuery("");
  }
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
          <SidebarUserAccount
            before={
              // Only Training Institute Teachers receive Notifications (ADR-0041 §1).
              teacherBell ? (
                <NotificationBell className={SIDEBAR_BELL_CLASS} />
              ) : null
            }
          />
          <SidebarSearch
            aria-label="Search menu"
            placeholder="Search menu…"
            value={menuQuery}
            onChange={(event) => {
              setMenuQuery(event.target.value);
            }}
          />
        </SidebarHeader>
        <SidebarContent
          ref={menuRef}
          data-fade-top={menuFade.top || undefined}
          data-fade-bottom={menuFade.bottom || undefined}
          className={scrollFadeClass(menuFade)}
        >
          {/* One hover pill per scrolling region (ADR-0050). */}
          <SidebarGlide>
            {preschool ? (
              <PreschoolSidebarNav query={menuQuery} />
            ) : (
              <SidebarGroup className="px-3 pt-2">
                <SidebarSectionLabel>Main menu</SidebarSectionLabel>
                <SidebarGroupContent>
                  <SidebarMainNav items={navigation} query={menuQuery} />
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarGlide>
        </SidebarContent>
        <SidebarFooter className="gap-2 px-3 pt-2 pb-3">
          {role === "owner" && !preschool ? <SidebarTodayCard /> : null}
          <SidebarGlide>
            <SidebarMenu className="gap-1">
              {preschool ? <SwitchCentre /> : null}
              <SidebarMenuItem>
                <SwitchWorkspace />
              </SidebarMenuItem>
              <SidebarMenuItem>
                <ThemeToggle />
              </SidebarMenuItem>
              <SidebarSignOut />
            </SidebarMenu>
          </SidebarGlide>
        </SidebarFooter>
      </Sidebar>
      {/* Room for SidebarReopenTrigger while the sidebar is collapsed (ADR-0050). */}
      <SidebarInset className="min-w-0 md:peer-data-[state=collapsed]:pl-12">
        {/* No top bar from md up: the sidebar carries it (ADR-0050). */}
        <SidebarReopenTrigger />
        <SidebarPhoneBar>
          <p className="text-foreground flex min-w-0 items-center gap-2">
            <Image
              src="/whiteboard-logo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 rounded-lg"
            />
            <span className="truncate text-sm font-semibold">Whiteboard</span>
          </p>
          {teacherBell ? (
            <div className="ml-auto">
              <NotificationBell />
            </div>
          ) : null}
        </SidebarPhoneBar>
        <div className="px-4 pt-5 sm:px-6 print:hidden">
          <AppBreadcrumbs />
        </div>
        {/* tabIndex -1: Skip to content can move focus here without adding a Tab stop. */}
        <main
          id="main-content"
          tabIndex={-1}
          className={`${PAGE_WATERMARK_HOST_CLASS} flex min-w-0 flex-1 flex-col outline-none`}
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
