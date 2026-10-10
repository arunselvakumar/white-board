import { amenityRoutes } from "../../amenity-routes";

export const dynamic = "force-dynamic";

/** Assigns a Amenity to exactly these Projects (among those the caller sees). */
export const POST = amenityRoutes.assignProjects;
