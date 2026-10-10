import { amenityRoutes } from "./amenity-routes";

export const dynamic = "force-dynamic";

/** Every live Amenity of the Active Company, by name, with its Projects; `?status=enabled` for pickers. */
export const GET = amenityRoutes.list;

/** Adds a Amenity, optionally on Projects. 409 when a live one has the name. */
export const POST = amenityRoutes.create;
