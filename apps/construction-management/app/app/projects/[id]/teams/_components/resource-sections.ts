import { Hammer, Handshake, Truck, Users, type LucideIcon } from "lucide-react";

import type { ResourceSection } from "@/src/queries/project-resources";
import { type AppHref, pageHref } from "@/lib/page-href";

export type ResourceSectionInfo = {
  key: ResourceSection;
  title: string;
  singular: string;
  /** Under the section title. */
  description: string;
  /** The page where this kind of party is added. */
  addPath: AppHref;
  /** The main-menu area that page is in, for the empty states. */
  area: string;
  /** The page of one of them, which a row opens (ADR CM-0044 §1). */
  pagePath: (id: string) => AppHref;
  icon: LucideIcon;
};

/** The four sections of a Project's Resources, in screen order. */
export const RESOURCE_SECTIONS: readonly ResourceSectionInfo[] = [
  {
    key: "teamMembers",
    title: "Team Members",
    singular: "Team Member",
    description:
      "Team Members on a Project see it and work on it. The Owner is on every Project.",
    addPath: "/app/staff/office-staff/new",
    pagePath: (id) => pageHref("/app/staff/office-staff/[id]", { id }),
    area: "Human Resources",
    icon: Users,
  },
  {
    key: "contractors",
    title: "Contractors",
    singular: "Contractor",
    description: "Parties that execute work on this Project.",
    addPath: "/app/masters/contractors/new",
    pagePath: (id) => pageHref("/app/masters/contractors/[id]", { id }),
    area: "Masters",
    icon: Hammer,
  },
  {
    key: "suppliers",
    title: "Suppliers",
    singular: "Supplier",
    description: "Parties that sell material for this Project.",
    addPath: "/app/masters/suppliers/new",
    pagePath: (id) => pageHref("/app/masters/suppliers/[id]", { id }),
    area: "Masters",
    icon: Truck,
  },
  {
    key: "vendors",
    title: "Vendors",
    singular: "Vendor",
    description:
      "Labour gangs on this Project; they appear on its attendance screen.",
    addPath: "/app/staff/vendors/new",
    pagePath: (id) => pageHref("/app/staff/vendors/[id]", { id }),
    area: "Human Resources",
    icon: Handshake,
  },
];
