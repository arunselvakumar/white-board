import { bookingFileRoutes } from "../../../../booking-file-routes";

export const dynamic = "force-dynamic";

/** Removes a file: Update removes any, an uploader their own. 204. */
export const POST = bookingFileRoutes.remove;
