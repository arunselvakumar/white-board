import { CalendarClock, Hash, type LucideIcon } from "lucide-react";

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
];
