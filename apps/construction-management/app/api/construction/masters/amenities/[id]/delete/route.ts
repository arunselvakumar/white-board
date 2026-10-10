import { amenityRoutes } from "../../amenity-routes";

export const dynamic = "force-dynamic";

/** Deletes a Amenity (a tombstone). 409 while a Project has it. */
export const POST = amenityRoutes.delete;
