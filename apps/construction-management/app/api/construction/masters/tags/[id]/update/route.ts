import { tagRoutes } from "../../tag-routes";

export const dynamic = "force-dynamic";

/** Renames a Tag; 409 when someone changed it meanwhile or the name is taken. */
export const POST = tagRoutes.update;
