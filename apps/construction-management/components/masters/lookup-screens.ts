import { HardHat, Wrench, type LucideIcon } from "lucide-react";

import type { LookupList } from "@/src/queries/masters";

/** The words and icon of a name-only masters list screen. */
export type LookupScreenConfig = {
  list: LookupList;
  /** Error code prefix: `LABOUR_CATEGORY_NAME_IN_USE`. */
  code: string;
  singular: string;
  plural: string;
  description: string;
  dialogDescription: string;
  placeholder: string;
  emptyDescription: string;
  deleteDescription: string;
  icon: LucideIcon;
};

export const LABOUR_CATEGORIES_SCREEN: LookupScreenConfig = {
  list: "labour-categories",
  code: "LABOUR_CATEGORY",
  singular: "Labour Category",
  plural: "Labour Categories",
  description: "Trades Labours and a Vendor's headcount are booked under.",
  dialogDescription:
    "A trade a Labour or a Vendor's headcount is booked under.",
  placeholder: "Bar Bender",
  emptyDescription:
    "Add the trades your Labours work in, like Mason, Helper or Carpenter.",
  deleteDescription:
    "It will no longer be offered anywhere. A Labour Category that Labours, Vendor rate cards or attendance use cannot be deleted; disable it instead.",
  icon: HardHat,
};

export const DEPARTMENTS_SCREEN: LookupScreenConfig = {
  list: "departments",
  code: "DEPARTMENT",
  singular: "Department",
  plural: "Departments",
  description: "Trades and work categories: RCC, Plumbing, Painting…",
  dialogDescription:
    "A trade or work category Contractors, worksheets and issues are booked under.",
  placeholder: "Fencing",
  emptyDescription:
    "Add the trades and work categories you book work under, like RCC or Plumbing.",
  deleteDescription: "It will no longer be offered anywhere.",
  icon: Wrench,
};
