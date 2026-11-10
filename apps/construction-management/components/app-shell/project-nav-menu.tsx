"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@repo/ui/components/collapsible";
import { SidebarSectionLabel } from "@repo/ui/components/sidebar-chrome";
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
  ATTENDANCE_TABS,
  attendanceNavLinks,
} from "@/components/attendance/attendance-tabs";
import { usePaymentsNavLinks } from "@/app/app/_components/finance/payments-hub/payments-nav";
import { PAYMENTS_TABS } from "@/app/app/_components/finance/payments-hub/payments-tabs";
import { useMaterialsNavLinks } from "@/app/app/_components/procurement/materials-hub/materials-nav";
import { MATERIALS_TABS } from "@/app/app/_components/procurement/materials-hub/materials-tabs";
import { ProjectAvatar } from "@/app/app/_components/projects/project-avatar";
import { PROJECT_MODULE_ICONS } from "@/app/app/_components/projects/project-module-icons";
import { useEquipmentNavLinks } from "@/app/app/_components/site-work/equipment/equipment-nav";
import { EQUIPMENT_TABS } from "@/app/app/_components/site-work/equipment/equipment-tabs";
import { bookingsNavLinks } from "@/app/app/_components/sales/bookings/bookings-nav";
import { useInquiryNavLinks } from "@/app/app/_components/sales/inquiries/inquiry-nav";
import { INQUIRY_TABS } from "@/app/app/_components/sales/inquiries/inquiry-tabs";
import {
  activeProjectSegment,
  projectBasePath,
  projectNavGroups,
  type ProjectNavGroup,
  type ProjectNavSection,
} from "@/lib/project-nav";
import {
  MenuSkeleton,
  SKELETON_WIDTHS,
} from "@/components/app-shell/app-shell-skeletons";
import {
  SUBMENU_BUTTON_CLASS,
  SUBMENU_CLASS,
  SubmenuRow,
} from "@/components/app-shell/submenu-row";
import type { ProjectModuleKey } from "@/src/projects/domain/project-modules";
import { projectTypeLabel } from "@/src/projects/domain/project-type";
import { BOOKINGS_TABS } from "@/src/queries/sales-units";
import { projectHomeQuery } from "@/src/queries/project-home";
import { projectQuery } from "@/src/queries/projects";

import {
  filterMenuArea,
  labelMatches,
  menuQuery,
  noMatchMessage,
} from "./menu-filter";

type SubLink = { href: string; label: string };

/**
 * Under a menu search query: `all` when the module (or its heading)
 * matched and shows every tab, else only the tabs matching `query`. The
 * submenu is held open either way.
 */
type EntryFilter = { query: string; all: boolean };

type EntryProps = {
  projectId: string;
  section: ProjectNavSection;
  /** The page is this module's. */
  active: boolean;
  pathname: string;
  buttonClassName: string;
  filter: EntryFilter | null;
};

/**
 * Every tab a module can fold out, by label, for the menu search. The
 * submenu itself may show fewer once the viewer's access loads.
 */
function submenuLabels(key: ProjectModuleKey): readonly { label: string }[] {
  switch (key) {
    case "attendance":
      return ATTENDANCE_TABS;
    case "payments":
      return PAYMENTS_TABS;
    case "materials":
      return MATERIALS_TABS;
    case "equipment_usage":
      return EQUIPMENT_TABS;
    case "bookings":
      return BOOKINGS_TABS;
    case "inquiries":
      return INQUIRY_TABS;
    default:
      return [];
  }
}

type ShownGroup = {
  label: string;
  sections: { section: ProjectNavSection; filter: EntryFilter | null }[];
};

/**
 * The Project's groups and modules under the (normalised) menu search
 * query (`menu-filter.ts`): a heading that matches keeps all its modules,
 * a module matches by its label or one of its tabs', and a heading with no
 * module left goes.
 */
function filterProjectGroups(
  groups: readonly ProjectNavGroup[],
  query: string,
): ShownGroup[] {
  return groups.flatMap((group): ShownGroup[] => {
    const headingMatches = query !== "" && labelMatches(group.label, query);
    const sections = group.sections.flatMap(
      (section): ShownGroup["sections"] => {
        if (query === "") return [{ section, filter: null }];
        if (headingMatches) return [{ section, filter: { query, all: true } }];
        const match = filterMenuArea(
          section.label,
          [{ sections: submenuLabels(section.key) }],
          query,
        );
        return match == null
          ? []
          : [{ section, filter: { query, all: match.all } }];
      },
    );
    return sections.length === 0 ? [] : [{ label: group.label, sections }];
  });
}

/**
 * The sidebar inside a Project (ADR CM-0020): Back to projects, the
 * Project's logo and name, then its modules under fixed headings. Modules
 * with tabs (Attendance, Payments, Materials, Equipment) fold out into a
 * submenu that opens by itself on any of their pages. The menu search
 * narrows the modules and their tabs; Back to projects and the Project
 * stay.
 */
export function ProjectNavMenu({
  projectId,
  pathname,
  query = "",
  buttonClassName,
}: {
  projectId: string;
  pathname: string;
  /** The sidebar's menu search, as typed. */
  query?: string;
  buttonClassName: string;
}) {
  // The shell sits outside the page's Suspense boundary: plain reads, never suspend.
  const { data: project, isPending: projectPending } = useQuery(
    projectQuery(projectId),
  );
  const { data: home, isPending: homePending } = useQuery(
    projectHomeQuery(projectId),
  );
  const loading = projectPending && homePending;
  const groups = loading ? [] : projectNavGroups(home, project?.structure);
  const current = activeProjectSegment(
    pathname,
    projectId,
    groups.flatMap((group) => group.sections.map((section) => section.segment)),
  );
  const shown = filterProjectGroups(groups, menuQuery(query));

  // Opening a Project on a module low in the menu (Payments, Reports)
  // scrolls its entry into view, once the menu has loaded.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (loading) return;
    navRef.current
      ?.querySelector("[aria-current=page]")
      ?.scrollIntoView({ block: "center" });
  }, [loading, projectId]);

  return (
    <>
      <SidebarGroup className="px-3 pt-4">
        <SidebarMenu className="gap-3">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Back to projects"
              className={buttonClassName}
              render={<Link href="/app/projects" />}
            >
              <ArrowLeft />
              <span className="min-w-0 flex-1 truncate">Back to projects</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <li className="flex min-w-0 items-center gap-3 px-3 py-1">
            {project == null ? (
              <MenuSkeleton width="80%" />
            ) : (
              <>
                <ProjectAvatar
                  name={project.name}
                  logoUrl={project.logoUrl}
                  className="size-9"
                />
                <div className="min-w-0">
                  <p className="text-sidebar-foreground line-clamp-2 text-sm leading-tight font-semibold break-words">
                    {project.name}
                  </p>
                  {project.projectType == null ? null : (
                    <p className="text-sidebar-foreground/65 truncate text-xs">
                      {projectTypeLabel(project.projectType)}
                    </p>
                  )}
                </div>
              </>
            )}
          </li>
        </SidebarMenu>
      </SidebarGroup>
      <nav ref={navRef} aria-label="Project">
        {loading ? (
          <SidebarGroup className="px-3">
            <SidebarMenu className="gap-1">
              {SKELETON_WIDTHS.map((width) => (
                <SidebarMenuItem key={width}>
                  <MenuSkeleton width={width} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : shown.length === 0 && groups.length > 0 ? (
          <p className="text-sidebar-foreground/55 px-6 py-2 text-sm">
            {noMatchMessage(query)}
          </p>
        ) : (
          shown.map((group) => (
            <SidebarGroup key={group.label} className="px-3 py-1.5">
              {/* data-sidebar: the group's label, as the kit's own marks it. */}
              <SidebarSectionLabel data-sidebar="group-label">
                {group.label}
              </SidebarSectionLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.sections.map(({ section, filter }) => (
                    <ProjectNavEntry
                      key={section.key}
                      projectId={projectId}
                      section={section}
                      active={section.segment === current}
                      pathname={pathname}
                      buttonClassName={buttonClassName}
                      filter={filter}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </nav>
    </>
  );
}

function ProjectNavEntry(props: EntryProps) {
  switch (props.section.key) {
    case "attendance":
      return <AttendanceEntry {...props} />;
    case "payments":
      return <PaymentsEntry {...props} />;
    case "materials":
      return <MaterialsEntry {...props} />;
    case "equipment_usage":
      return <EquipmentEntry {...props} />;
    case "bookings":
      return <BookingsEntry {...props} />;
    case "inquiries":
      return <InquiriesEntry {...props} />;
    default:
      return <ProjectNavItem {...props} />;
  }
}

/**
 * A submenu's open state: open on the module's pages, foldable by hand,
 * and opened again on arriving at one of them (state adjusted in render).
 * Held open while the menu search has a query (`filter`).
 */
function useSubmenuOpen({ active, filter }: EntryProps) {
  const [open, setOpen] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }
  return [open || filter != null, setOpen] as const;
}

function AttendanceEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props);
  return (
    <ProjectNavItem
      {...props}
      submenu={{
        open,
        onOpenChange: setOpen,
        links: attendanceNavLinks(props.projectId),
      }}
    />
  );
}

function PaymentsEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props);
  const links = usePaymentsNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

function MaterialsEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props);
  const links = useMaterialsNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

function EquipmentEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props);
  const links = useEquipmentNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

function InquiriesEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props);
  const links = useInquiryNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

function isOn(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ProjectNavItem({
  projectId,
  section,
  active,
  pathname,
  buttonClassName,
  filter,
  submenu,
}: EntryProps & {
  submenu?: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    links: readonly SubLink[];
  };
}) {
  const base = projectBasePath(projectId);
  const href = `${base}/${section.segment}`;
  const Icon = PROJECT_MODULE_ICONS[section.key];
  const currentLink = submenu?.links.find((link) => isOn(pathname, link.href));

  const button = (
    <SidebarMenuButton
      // With a tab open, the tab carries the highlight.
      isActive={active && currentLink == null}
      tooltip={section.label}
      aria-current={
        active && (submenu == null || pathname === href) ? "page" : undefined
      }
      className={buttonClassName}
      render={<Link href={href} />}
    >
      <Icon />
      <span className="min-w-0 flex-1 truncate">{section.label}</span>
    </SidebarMenuButton>
  );

  if (submenu == null) return <SidebarMenuItem>{button}</SidebarMenuItem>;

  const links =
    filter == null || filter.all
      ? submenu.links
      : submenu.links.filter((link) => labelMatches(link.label, filter.query));
  // The matching tab is one the viewer may not read: the module alone.
  if (links.length === 0 && filter != null && !filter.all)
    return <SidebarMenuItem>{button}</SidebarMenuItem>;

  return (
    <SidebarMenuItem>
      <Collapsible open={submenu.open} onOpenChange={submenu.onOpenChange}>
        <SubmenuRow button={button} label={section.label} open={submenu.open} />
        <CollapsibleContent>
          <SidebarMenuSub aria-label={section.label} className={SUBMENU_CLASS}>
            {links.map((link) => {
              const linkActive = link === currentLink;
              return (
                <SidebarMenuSubItem key={link.href}>
                  <SidebarMenuSubButton
                    isActive={linkActive}
                    aria-current={linkActive ? "page" : undefined}
                    className={SUBMENU_BUTTON_CLASS}
                    render={<Link href={link.href} />}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {link.label}
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

// Bookings' tabs: Units and Bookings.
function BookingsEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props);
  return (
    <ProjectNavItem
      {...props}
      submenu={{
        open,
        onOpenChange: setOpen,
        links: bookingsNavLinks(props.projectId),
      }}
    />
  );
}
