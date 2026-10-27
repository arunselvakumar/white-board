"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
} from "@repo/ui/components/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@repo/ui/components/sidebar";

import { attendanceNavLinks } from "@/components/attendance/attendance-tabs";
import { usePaymentsNavLinks } from "@/components/finance/payments-hub/payments-nav";
import { useMaterialsNavLinks } from "@/components/procurement/materials-hub/materials-nav";
import { ProjectAvatar } from "@/components/projects/project-avatar";
import { PROJECT_MODULE_ICONS } from "@/components/projects/project-module-icons";
import { useEquipmentNavLinks } from "@/components/site-work/equipment/equipment-nav";
// Sales (CM-1006)
import { bookingsNavLinks } from "@/components/sales/bookings/bookings-nav";
// Sales (CM-1002)
import { useInquiryNavLinks } from "@/components/sales/inquiries/inquiry-nav";
import {
  activeProjectSegment,
  projectBasePath,
  projectNavGroups,
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
import { projectTypeLabel } from "@/src/projects/domain/project-type";
import { projectHomeQuery } from "@/src/queries/project-home";
import { projectQuery } from "@/src/queries/projects";

const GROUP_LABEL_CLASS =
  "text-sidebar-foreground/65 px-3 text-[11px] font-semibold tracking-[0.12em] uppercase";

type SubLink = { href: string; label: string };

type EntryProps = {
  projectId: string;
  section: ProjectNavSection;
  /** The page is this module's. */
  active: boolean;
  pathname: string;
  buttonClassName: string;
};

/**
 * The sidebar inside a Project (ADR CM-0020): Back to projects, the
 * Project's logo and name, then its modules under fixed headings. Modules
 * with tabs (Attendance, Payments, Materials, Equipment) fold out into a
 * submenu that opens by itself on any of their pages.
 */
export function ProjectNavMenu({
  projectId,
  pathname,
  buttonClassName,
}: {
  projectId: string;
  pathname: string;
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
              variant="outline"
              tooltip="Back to projects"
              className={buttonClassName}
              render={<Link href="/app/projects" />}
            >
              <ArrowLeft />
              <span>Back to projects</span>
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
        ) : (
          groups.map((group) => (
            <SidebarGroup key={group.label} className="px-3 py-1.5">
              <SidebarGroupLabel className={GROUP_LABEL_CLASS}>
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1">
                  {group.sections.map((section) => (
                    <ProjectNavEntry
                      key={section.key}
                      projectId={projectId}
                      section={section}
                      active={section.segment === current}
                      pathname={pathname}
                      buttonClassName={buttonClassName}
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
    // Sales (CM-1006)
    case "bookings":
      return <BookingsEntry {...props} />;
    // Sales (CM-1002)
    case "inquiries":
      return <InquiriesEntry {...props} />;
    default:
      return <ProjectNavItem {...props} />;
  }
}

/**
 * A submenu's open state: open on the module's pages, foldable by hand,
 * and opened again on arriving at one of them (state adjusted in render).
 */
function useSubmenuOpen(active: boolean) {
  const [open, setOpen] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }
  return [open, setOpen] as const;
}

function AttendanceEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props.active);
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
  const [open, setOpen] = useSubmenuOpen(props.active);
  const links = usePaymentsNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

function MaterialsEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props.active);
  const links = useMaterialsNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

function EquipmentEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props.active);
  const links = useEquipmentNavLinks(props.projectId, open);
  return (
    <ProjectNavItem
      {...props}
      submenu={{ open, onOpenChange: setOpen, links }}
    />
  );
}

// Sales (CM-1002): the Inquiries module's tabs.
function InquiriesEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props.active);
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
      <span>{section.label}</span>
    </SidebarMenuButton>
  );

  if (submenu == null) return <SidebarMenuItem>{button}</SidebarMenuItem>;

  return (
    <SidebarMenuItem>
      <Collapsible open={submenu.open} onOpenChange={submenu.onOpenChange}>
        <SubmenuRow button={button} label={section.label} open={submenu.open} />
        <CollapsibleContent>
          <SidebarMenuSub aria-label={section.label} className={SUBMENU_CLASS}>
            {submenu.links.map((link) => {
              const linkActive = link === currentLink;
              return (
                <SidebarMenuSubItem key={link.href}>
                  <SidebarMenuSubButton
                    isActive={linkActive}
                    aria-current={linkActive ? "page" : undefined}
                    className={SUBMENU_BUTTON_CLASS}
                    render={<Link href={link.href} />}
                  >
                    <span>{link.label}</span>
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

// Sales (CM-1006): Bookings → Units, Bookings.
function BookingsEntry(props: EntryProps) {
  const [open, setOpen] = useSubmenuOpen(props.active);
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
