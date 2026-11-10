import { Hammer, Truck, type LucideIcon } from "lucide-react";

import type { PartyList } from "@/src/queries/parties";

export type PartyScreen = {
  list: PartyList;
  label: string;
  plural: string;
  path: string;
  /** Under the list's title. */
  meta: string;
  /** The empty list's message. */
  empty: string;
  icon: LucideIcon;
  /** Contractors work in Departments; Suppliers have none. */
  departments: boolean;
};

/** The words and paths of the two party masters (CM-406). */
export const PARTY_SCREENS: Record<PartyList, PartyScreen> = {
  contractors: {
    list: "contractors",
    label: "Contractor",
    plural: "Contractors",
    path: "/app/masters/contractors",
    meta: "Parties that execute work on your Projects, by Department.",
    empty:
      "Add the Contractors you give work to, with the Departments they work in and their Projects.",
    icon: Hammer,
    departments: true,
  },
  suppliers: {
    list: "suppliers",
    label: "Supplier",
    plural: "Suppliers",
    path: "/app/masters/suppliers",
    meta: "Parties you buy material from.",
    empty:
      "Add the Suppliers you buy cement, steel, bricks and other material from, and their Projects.",
    icon: Truck,
    departments: false,
  },
};

export function partyEditPath(screen: PartyScreen, id: string): string {
  return `${screen.path}/${encodeURIComponent(id)}`;
}
