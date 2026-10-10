import { amenityRoutes } from "../../amenity-routes";

export const dynamic = "force-dynamic";

/** Takes a Amenity off the pickers; the Projects that have it keep it. */
export const POST = amenityRoutes.disable;
