import {
  Building2,
  CalendarClock,
  DatabaseBackup,
  ClipboardCheck,
  Hash,
  MapPinned,
  type LucideIcon,
} from "lucide-react";

/** The Company rules under Settings → Advanced Settings (`modules/12`). */
export const SETTINGS_SECTIONS: readonly {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    href: "/app/settings/sequence-ids",
    title: "Sequence IDs",
    description:
      "How PR, PO, GRN and other document numbers look, e.g. PR/26-27/00001.",
    icon: Hash,
  },
  {
    href: "/app/settings/backdated-entry",
    title: "Back-dated Entry",
    description:
      "How far back your team may create or edit entries, and the Financial Closing Date.",
    icon: CalendarClock,
  },
  {
    href: "/app/settings/billing-addresses",
    title: "Billing addresses",
    description:
      "The addresses and GSTINs your Purchase Orders bill from, and the default.",
    icon: MapPinned,
  },
  {
    href: "/app/settings/grn-fields",
    title: "GRN fields",
    description:
      "Which optional invoice and delivery fields a Goods Receipt shows and prints.",
    icon: ClipboardCheck,
  },
  {
    href: "/app/settings/company",
    title: "Company",
    description:
      "Transfer ownership to another Team Member, or delete the Company. Owner only.",
    icon: Building2,
  },
  {
    href: "/app/settings/backup",
    title: "Backup & export",
    description:
      "A full backup of every Project, master record and setting, as a ZIP. Owner only.",
    icon: DatabaseBackup,
  },
];
