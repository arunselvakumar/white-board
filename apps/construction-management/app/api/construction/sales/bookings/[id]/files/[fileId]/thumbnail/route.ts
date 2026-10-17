import { bookingFileRoutes } from "../../../../booking-file-routes";

export const dynamic = "force-dynamic";

/** An image's thumbnail; 404 `THUMBNAIL_NOT_FOUND` when none was made. */
export const GET = bookingFileRoutes.readThumbnail;
