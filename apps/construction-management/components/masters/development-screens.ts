import { Fence, Waves, type LucideIcon } from "lucide-react";

import type { DevelopmentList } from "@/src/queries/developments";

/** The words and icon of an Amenities or Common Developments screen. */
export type DevelopmentScreenConfig = {
  list: DevelopmentList;
  /** Error code prefix: `AMENITY_NAME_IN_USE`. */
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

export const AMENITIES_SCREEN: DevelopmentScreenConfig = {
  list: "amenities",
  code: "AMENITY",
  singular: "Amenity",
  plural: "Amenities",
  description:
    "Facilities a Project offers: pool, club house, gym. Site entries can be located at them.",
  dialogDescription:
    "A facility a Project offers its buyers; site work on it is located here.",
  placeholder: "Tennis Court",
  emptyDescription:
    "Add the facilities your Projects offer, like a Swimming Pool or a Club House.",
  deleteDescription:
    "It will no longer be offered anywhere. An Amenity a Project has cannot be deleted; remove it from those Projects or disable it instead.",
  icon: Waves,
};

export const COMMON_DEVELOPMENTS_SCREEN: DevelopmentScreenConfig = {
  list: "common-developments",
  code: "COMMON_DEVELOPMENT",
  singular: "Common Development",
  plural: "Common Developments",
  description:
    "Shared works on a site: compound wall, roads, sump, STP. Site entries can be located at them.",
  dialogDescription:
    "Work done for the whole site rather than a Unit; site work on it is located here.",
  placeholder: "Transformer Yard",
  emptyDescription:
    "Add the shared works your sites need, like a Compound Wall or Internal Roads.",
  deleteDescription:
    "It will no longer be offered anywhere. A Common Development a Project has cannot be deleted; remove it from those Projects or disable it instead.",
  icon: Fence,
};
