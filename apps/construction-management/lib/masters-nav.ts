import {
  BadgeCheck,
  CircleAlert,
  Tag,
  Landmark,
  Tags,
  UserRoundPlus,
  FileText,
  Files,
  FolderTree,
  Package,
  Ruler,
  Fence,
  Hammer,
  Handshake,
  HardHat,
  Layers,
  Shovel,
  Tractor,
  Truck,
  UserCheck,
  Users,
  Waves,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type MastersSection = {
  href: string;
  /** Sidebar label; short enough for the submenu. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export type MastersGroup = {
  label: string;
  sections: readonly MastersSection[];
};

/**
 * The Company's lists under Masters, grouped the way the sidebar
 * submenu and the Masters page show them. Each milestone adds its masters to
 * a group (or a new group) here; nothing else needs to change.
 */
export const MASTERS_GROUPS: readonly MastersGroup[] = [
  {
    label: "Company",
    sections: [
      {
        href: "/app/masters/team-members",
        label: "Team Members",
        title: "Team Members",
        description:
          "Invite your team, choose their Projects and what each one may do.",
        icon: Users,
      },
      {
        href: "/app/masters/designations",
        label: "Designations",
        title: "Designations",
        description:
          "Job titles and the Permission Template each one starts with.",
        icon: BadgeCheck,
      },
    ],
  },
  {
    label: "Parties",
    sections: [
      {
        href: "/app/masters/contractors",
        label: "Contractors",
        title: "Contractors",
        description:
          "Parties that execute work, by Department, and their Projects.",
        icon: Hammer,
      },
      {
        href: "/app/masters/suppliers",
        label: "Suppliers",
        title: "Suppliers",
        description: "Parties you buy material from, and their Projects.",
        icon: Truck,
      },
      {
        href: "/app/masters/other-parties",
        label: "Other Parties",
        title: "Other Parties",
        description:
          "Anyone else you buy from or bill: landlords, consultants, buyers.",
        icon: UserRoundPlus,
      },
    ],
  },
  {
    label: "Accounts",
    sections: [
      {
        href: "/app/masters/bank-accounts",
        label: "Company's Bank A/C",
        title: "Company's Bank A/C",
        description:
          "Company cash and bank accounts, their opening balances and the primary one.",
        icon: Landmark,
      },
      {
        href: "/app/masters/payment-categories",
        label: "Payment Categories",
        title: "Payment Categories",
        description:
          "What money is spent on: fuel, rent, conveyance, and your own.",
        icon: Tags,
      },
    ],
  },
  {
    label: "Materials",
    sections: [
      {
        href: "/app/masters/materials",
        label: "Materials",
        title: "Materials",
        description:
          "What you buy and stock: unit, category, rate, GST, HSN and minimum stock.",
        icon: Package,
      },
      {
        href: "/app/masters/material-categories",
        label: "Material Categories",
        title: "Material Categories",
        description:
          "Groups of Materials, one level deep: Civil Work Materials › Cement.",
        icon: FolderTree,
      },
      {
        href: "/app/masters/measurement-units",
        label: "Measurement Units",
        title: "Measurement Units",
        description: "Units Materials are counted in: Bag, kg, cum, sqft…",
        icon: Ruler,
      },
      {
        href: "/app/masters/terms-conditions",
        label: "Terms & Conditions",
        title: "Terms & Conditions",
        description: "Reusable terms you pick on Purchase Orders.",
        icon: FileText,
      },
      {
        href: "/app/masters/quotations",
        label: "View Quotations",
        title: "View Quotations",
        description:
          "Every quotation file your Contractors and Suppliers gave.",
        icon: Files,
      },
    ],
  },
  {
    label: "Labour & Vendors",
    sections: [
      {
        href: "/app/masters/labours",
        label: "Labours",
        title: "Labours",
        description:
          "Your own Labours: wage, Project, transfers and Excel import.",
        icon: Shovel,
      },
      {
        href: "/app/masters/vendors",
        label: "Vendors",
        title: "Vendors",
        description:
          "Labour gangs you hire by the head, with a rate card per shift.",
        icon: Handshake,
      },
      {
        href: "/app/masters/labour-categories",
        label: "Labour Categories",
        title: "Labour Categories",
        description:
          "Trades Labours and a Vendor's headcount are booked under.",
        icon: HardHat,
      },
      {
        href: "/app/masters/supervisors",
        label: "Supervisors",
        title: "Supervisors",
        description: "The people on site who look after a group of Labours.",
        icon: UserCheck,
      },
    ],
  },
  {
    label: "Work",
    sections: [
      {
        href: "/app/masters/departments",
        label: "Departments",
        title: "Departments",
        description: "Trades and work categories: RCC, Plumbing, Painting…",
        icon: Wrench,
      },
      {
        href: "/app/masters/work-types",
        label: "Work Types",
        title: "Work Types",
        description:
          "What a crew does within a Department, and the materials it uses.",
        icon: Layers,
      },
      {
        href: "/app/masters/equipments",
        label: "Equipments",
        title: "Equipments",
        description:
          "Owned and rented plant: where it is, maintenance and hire rates.",
        icon: Tractor,
      },
    ],
  },
  {
    label: "Tasks & Issues",
    sections: [
      {
        href: "/app/masters/issue-categories",
        label: "Issue Categories",
        title: "Issue Categories",
        description:
          "What an issue or snag is about: Quality, Safety, Design, RFI…",
        icon: CircleAlert,
      },
      {
        href: "/app/masters/tags",
        label: "Tags",
        title: "Tags",
        description: "Labels you put on Tasks to find and filter them.",
        icon: Tag,
      },
    ],
  },
  {
    label: "Projects",
    sections: [
      {
        href: "/app/masters/amenities",
        label: "Amenities",
        title: "Amenities",
        description:
          "Facilities a Project offers, like a pool or club house, and the Projects that have them.",
        icon: Waves,
      },
      {
        href: "/app/masters/common-developments",
        label: "Common Developments",
        title: "Common Developments",
        description:
          "Shared site works, like the compound wall or internal roads, and their Projects.",
        icon: Fence,
      },
    ],
  },
];

/** Every Masters section, in sidebar order. */
export const MASTERS_SECTIONS: readonly MastersSection[] =
  MASTERS_GROUPS.flatMap((group) => group.sections);

/** The section a Masters path belongs to (its page or anything under it). */
export function activeMastersSection(
  pathname: string,
): MastersSection | undefined {
  return MASTERS_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}
