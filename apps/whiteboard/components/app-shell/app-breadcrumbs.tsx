"use client";

import { useAuth } from "@repo/auth/react";
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

export function AppBreadcrumbs() {
  const { role } = useAuth();
  const crumbs = getAppBreadcrumbs(usePathname() || "/", role);

  return (
    <Breadcrumb className="min-w-0 overflow-x-auto" aria-label="Breadcrumb">
      <BreadcrumbList className="w-max flex-nowrap gap-1.5 text-[13px] whitespace-nowrap sm:gap-2">
        {crumbs.map((crumb, index) => {
          return (
            <FragmentWithSeparator
              key={`${index}-${crumb.label}`}
              first={index === 0}
            >
              <BreadcrumbItem>
                {crumb.href != null && index < crumbs.length - 1 ? (
                  <BreadcrumbLink
                    render={<Link href={crumb.href} />}
                    className="focus-visible:outline-ring hover:bg-card hover:text-foreground inline-flex min-h-8 items-center rounded-lg px-2.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="border-border/70 bg-card inline-flex min-h-8 items-center rounded-lg border px-3 font-semibold shadow-sm">
                    {crumb.label}
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
