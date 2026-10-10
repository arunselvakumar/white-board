import { amenityRoutes } from "../../amenity-routes";

export const dynamic = "force-dynamic";

/** Renames a Amenity; carries the `updatedAt` it loaded (409 when stale). */
export const POST = amenityRoutes.update;
