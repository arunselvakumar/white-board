import { Hammer, Handshake, Truck, Users, type LucideIcon } from "lucide-react";

import type { ResourceSection } from "@/src/queries/project-resources";

export type ResourceSectionInfo = {
  key: ResourceSection;
  title: string;
  singular: string;
  /** Under the section title. */
  description: string;
  /** The page where this kind of party is added. */
  addPath: string;
  /** The main-menu area that page is in, for the empty states. */
  area: string;
  icon: LucideIcon;
};

/** The four sections of a Project's Resources, in screen order (CM-406). */
export const RESOURCE_SECTIONS: readonly ResourceSectionInfo[] = [
  {
    key: "teamMembers",
    title: "Team Members",
    singular: "Team Member",
    description:
      "Team Members on a Project see it and work on it. The Owner is on every Project.",
    addPath: "/app/staff/new",
    area: "Staff & Roles",
    icon: Users,
  },
  {
    key: "contractors",
    title: "Contractors",
    singular: "Contractor",
    description: "Parties that execute work on this Project.",
    addPath: "/app/masters/contractors/new",
    area: "Masters",
    icon: Hammer,
  },
  {
    key: "suppliers",
    title: "Suppliers",
    singular: "Supplier",
    description: "Parties that sell material for this Project.",
    addPath: "/app/masters/suppliers/new",
    area: "Masters",
    icon: Truck,
  },
  {
    key: "vendors",
    title: "Vendors",
    singular: "Vendor",
    description:
      "Labour gangs on this Project; they appear on its attendance screen.",
    addPath: "/app/vendors/new",
    area: "Labour & Vendors",
    icon: Handshake,
  },
];
