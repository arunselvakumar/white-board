"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import { LayoutGrid, PanelLeft } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { SidebarAccount } from "@repo/ui/components/sidebar-chrome";

import { BrandMark } from "@/components/app-shell/brand-mark";

import { HOME_PATH } from "./main-menu-areas";
import { setMenuLayout } from "./menu-layout";
import { NAV_BUTTON_CLASS } from "./nav-button-class";
import { SidebarAccountRow } from "./sidebar-account-row";
import { SwitchCompany } from "./switch-company";

const PRODUCT = "Construction Management";

/** A text button on the ink bar: muted, lit on hover, the primary pill when current. */
const BAR_BUTTON_CLASS =
  "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground aria-[current=page]:bg-sidebar-primary aria-[current=page]:text-sidebar-primary-foreground h-10 gap-2 rounded-xl px-3";

/**
 * The top bar of the full-page menu layout (ADR CM-0039), in the sidebar's
 * ink because it stands in for the sidebar: the Active Company, Menu (the
 * main menu on one page), the switch back to the sidebar, Switch Company
 * (ADR-0051), then the User's account row with the notification bell and
 * the account menu. On a phone the account row drops to a line of its own.
 */
export function MenuTopBar({ pathname }: { pathname: string }) {
  const { company } = useActiveCompany();
  const onMenu = pathname === HOME_PATH;
  return (
    <header className="bg-sidebar text-sidebar-foreground ring-sidebar-border m-3 mb-0 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl px-3 py-2.5 ring-1 print:hidden">
      <SidebarAccount
        className="min-w-0 flex-1"
        avatar={<BrandMark className="size-9 rounded-xl" />}
        name={company?.name ?? PRODUCT}
        detail={company == null ? undefined : PRODUCT}
      />
      <nav
        aria-label="Menu layout"
        className="flex shrink-0 items-center gap-1"
      >
        <Link
          href={HOME_PATH}
          aria-current={onMenu ? "page" : undefined}
          className={buttonVariants({
            variant: "ghost",
            className: BAR_BUTTON_CLASS,
          })}
        >
          <LayoutGrid aria-hidden="true" />
          Menu
        </Link>
        <Button
          type="button"
          variant="ghost"
          className={BAR_BUTTON_CLASS}
          aria-label="Show the menu in the sidebar"
          onClick={() => {
            setMenuLayout("sidebar");
          }}
        >
          <PanelLeft aria-hidden="true" />
          <span className="max-sm:hidden">Sidebar</span>
        </Button>
      </nav>
      <div className="shrink-0">
        <SwitchCompany
          rowClassName={`${NAV_BUTTON_CLASS} hover:bg-sidebar-accent w-auto`}
        />
      </div>
      <div className="border-sidebar-border w-full border-t pt-1 md:w-64 md:border-t-0 md:border-l md:pt-0 md:pl-3">
        <SidebarAccountRow />
      </div>
    </header>
  );
}
