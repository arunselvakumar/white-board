"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/sidebar";

import {
  DEPARTMENTS_PATH,
  departmentCardAt,
  type DepartmentCard,
  type DepartmentCardGroup,
  type VisibleDepartment,
} from "@/lib/departments-nav";

import { filterMenuArea, menuQuery, noMatchMessage } from "./menu-filter";
import { SUBMENU_BUTTON_CLASS, SUBMENU_CLASS } from "./submenu-row";

export const BACK_TO_MAIN_MENU = "Back to Main Menu";

/**
 * The sidebar on a department's page and screens (ADR CM-0047), as inside
 * a Project (ADR CM-0020): Back to Main Menu, the department's icon and
 * name, then its screens. A labelled group (Human Resources' Staff and
 * HRMS) is a row that folds out into its screens, open to begin with and
 * opened again on arriving at one of them; an unlabelled one (Marketing)
 * is a plain list. The menu search narrows the screens; Back to Main Menu
 * and the department stay. The full-page menu (ADR CM-0039) keeps the
 * department's page of cards and has no sidebar.
 */
export function DepartmentMenu({
  shown: { department, groups },
  pathname,
  query = "",
  buttonClassName,
}: {
  shown: VisibleDepartment;
  pathname: string;
  /** The sidebar's menu search, as typed. */
  query?: string;
  buttonClassName: string;
}) {
  const current = departmentCardAt(groups, pathname);
  const q = menuQuery(query);
  const match = filterMenuArea(department.label, groups, q);
  const Icon = department.icon;

  // Opening a department on a screen low in its menu (HRMS → Leave on a
  // short window) scrolls its entry into view, as a Project's menu does.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current
      ?.querySelector("[aria-current=page]")
      ?.scrollIntoView({ block: "center" });
  }, [department.key]);

  return (
    <>
      <SidebarGroup className="px-3 pt-4">
        <SidebarMenu className="gap-3">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={BACK_TO_MAIN_MENU}
              className={buttonClassName}
              render={<Link href={DEPARTMENTS_PATH} />}
            >
              <ArrowLeft />
              <span className="min-w-0 flex-1 truncate">
                {BACK_TO_MAIN_MENU}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <li className="flex min-w-0 items-center gap-3 px-3 py-1">
            <span
              aria-hidden="true"
              className="bg-sidebar-primary text-sidebar-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl [&>svg]:size-[18px]"
            >
              <Icon />
            </span>
            <div className="min-w-0">
              <p className="text-sidebar-foreground line-clamp-2 text-sm leading-tight font-semibold break-words">
                {department.label}
              </p>
              <p className="text-sidebar-foreground/65 truncate text-xs">
                Department
              </p>
            </div>
          </li>
        </SidebarMenu>
      </SidebarGroup>
      <nav ref={navRef} aria-label={department.label}>
        {match == null ? (
          <p className="text-sidebar-foreground/55 px-6 py-2 text-sm">
            {noMatchMessage(query)}
          </p>
        ) : (
          <SidebarGroup className="px-3 py-1.5">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {match.groups.map((group) =>
                  group.label == null ? (
                    group.sections.map((section) => (
                      <ScreenRow
                        key={section.href}
                        section={section}
                        active={section.href === current?.href}
                        buttonClassName={buttonClassName}
                      />
                    ))
                  ) : (
                    <GroupRow
                      key={group.label}
                      label={group.label}
                      group={group}
                      current={current}
                      forceOpen={match.forceOpen}
                      buttonClassName={buttonClassName}
                    />
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </nav>
    </>
  );
}

/** A screen of a department without groups (Marketing), as a top-level row. */
function ScreenRow({
  section,
  active,
  buttonClassName,
}: {
  section: DepartmentCard;
  active: boolean;
  buttonClassName: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={section.label}
        aria-current={active ? "page" : undefined}
        className={buttonClassName}
        render={<Link href={section.href} />}
      >
        <section.icon />
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * A labelled group (Staff, HRMS): the row folds its screens out and in; it
 * is not a page. Folded away while one of its screens is open, the row
 * carries the highlight instead.
 */
function GroupRow({
  label,
  group,
  current,
  forceOpen,
  buttonClassName,
}: {
  label: string;
  group: DepartmentCardGroup;
  current: DepartmentCard | undefined;
  forceOpen: boolean;
  buttonClassName: string;
}) {
  const holdsCurrent =
    current != null &&
    group.sections.some((section) => section.href === current.href);
  const [open, setOpen] = useState(true);
  // Arriving on one of its screens opens it again (state adjusted in render).
  const [heldCurrent, setHeldCurrent] = useState(holdsCurrent);
  if (holdsCurrent !== heldCurrent) {
    setHeldCurrent(holdsCurrent);
    if (holdsCurrent) setOpen(true);
  }
  const shownOpen = open || forceOpen;
  const Icon = group.icon;

  return (
    <SidebarMenuItem>
      <Collapsible open={shownOpen} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <SidebarMenuButton
              isActive={!shownOpen && holdsCurrent}
              tooltip={label}
              className={`${buttonClassName} data-panel-open:[&>svg:last-child]:rotate-90`}
            />
          }
        >
          {Icon == null ? null : <Icon />}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronRight className="text-sidebar-foreground/65 transition-transform" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub aria-label={label} className={SUBMENU_CLASS}>
            {group.sections.map((section) => {
              const active = section.href === current?.href;
              return (
                <SidebarMenuSubItem key={section.href}>
                  <SidebarMenuSubButton
                    isActive={active}
                    aria-current={active ? "page" : undefined}
                    className={SUBMENU_BUTTON_CLASS}
                    render={<Link href={section.href} />}
                  >
                    <section.icon />
                    <span className="min-w-0 flex-1 truncate">
                      {section.label}
                    </span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}
