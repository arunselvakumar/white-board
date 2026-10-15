import { tagRoutes } from "./tag-routes";

export const dynamic = "force-dynamic";

/** The Company's Tags by name, with `inUse` and what the caller may do. */
export const GET = tagRoutes.list;

/** Adds a Tag. 409 when a live one has the name (any case). */
export const POST = tagRoutes.create;
