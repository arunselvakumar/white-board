"use client";

import { useAuth } from "@clerk/nextjs";
import {
  ClipboardList,
  FileText,
  Pencil,
  Plus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";

import { getAppBreadcrumbs } from "@/lib/app-breadcrumbs";

import { APP_NAV_ICONS } from "./app-nav-icons";

const icons: Record<string, LucideIcon> = {
  Dashboard: APP_NAV_ICONS["/"],
  Students: APP_NAV_ICONS["/students"],
  Student: UserRound,
  Courses: APP_NAV_ICONS["/courses"],
  Course: APP_NAV_ICONS["/courses"],
  Batches: APP_NAV_ICONS["/batches"],
  Batch: APP_NAV_ICONS["/batches"],
  Fees: APP_NAV_ICONS["/fees"],
  Enrollment: ClipboardList,
  Receipt: FileText,
  "Add Student": Plus,
  "Add Course": Plus,
  "Add Batch": Plus,
  "Edit Student": Pencil,
  "Edit Course": Pencil,
  "Edit Batch": Pencil,
  "Enroll Student": ClipboardList,
};

export function AppBreadcrumbs() {
  const { orgRole } = useAuth();
  const crumbs = getAppBreadcrumbs(usePathname() || "/", orgRole);

  return (
    <Breadcrumb className="min-w-0 overflow-x-auto" aria-label="Breadcrumb">
      <BreadcrumbList className="w-max flex-nowrap gap-2 whitespace-nowrap sm:gap-2.5">
        {crumbs.map((crumb, index) => {
          const Icon = icons[crumb.label] ?? FileText;
          const content = (
            <>
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{crumb.label}</span>
            </>
          );
          return (
            <FragmentWithSeparator
              key={`${index}-${crumb.label}`}
              first={index === 0}
            >
              <BreadcrumbItem>
                {crumb.href != null && index < crumbs.length - 1 ? (
                  <BreadcrumbLink
                    render={<Link href={crumb.href} />}
                    className="focus-visible:outline-ring inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {content}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="inline-flex items-center gap-1.5 font-medium">
                    {content}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </FragmentWithSeparator>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function FragmentWithSeparator({
  first,
  children,
}: {
  first: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {first ? null : <BreadcrumbSeparator />}
      {children}
    </>
  );
}
