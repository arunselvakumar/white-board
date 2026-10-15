import { tagRoutes } from "../tag-routes";

export const dynamic = "force-dynamic";

/**
 * The Task form's inline create (CM-0019 §1): the live Tag of this name
 * (any case), 200, or a new one, 201. Needs Tags Create.
 */
export const POST = tagRoutes.ensure;
