import { tagRoutes } from "../../tag-routes";

export const dynamic = "force-dynamic";

/** Deletes a Tag (a tombstone); 409 while a live tracking record uses it. */
export const POST = tagRoutes.delete;
