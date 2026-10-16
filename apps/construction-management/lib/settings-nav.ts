import {
  Building2,
  CalendarClock,
  DatabaseBackup,
  ClipboardCheck,
  Hash,
  MapPinned,
  type LucideIcon,
} from "lucide-react";

/** The Company settings under Masters → Settings (`modules/12`). */
export const SETTINGS_SECTIONS: readonly {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    href: "/app/masters/settings/sequence-ids",
    title: "Sequence IDs",
    description:
      "How PR, PO, GRN and other document numbers look, e.g. PR/26-27/00001.",
    icon: Hash,
  },
  {
    href: "/app/masters/settings/backdated-entry",
    title: "Back-dated Entry",
    description:
      "How far back your team may create or edit entries, and the Financial Closing Date.",
    icon: CalendarClock,
  },
  {
    href: "/app/masters/settings/billing-addresses",
    title: "Billing addresses",
    description:
      "The addresses and GSTINs your Purchase Orders bill from, and the default.",
    icon: MapPinned,
  },
  {
    href: "/app/masters/settings/grn-fields",
    title: "GRN fields",
    description:
      "Which optional invoice and delivery fields a Goods Receipt shows and prints.",
    icon: ClipboardCheck,
  },
  {
    href: "/app/masters/settings/company",
    title: "Company",
    description:
      "Transfer ownership to another Team Member, or delete the Company. Owner only.",
    icon: Building2,
  },
  {
    href: "/app/masters/settings/backup",
    title: "Backup & export",
    description:
      "A full backup of every Project, master record and setting, as a ZIP. Owner only.",
    icon: DatabaseBackup,
  },
];
