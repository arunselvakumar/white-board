import { bookingFileRoutes } from "../../../../booking-file-routes";

export const dynamic = "force-dynamic";

/** Step 2 in development and tests: the raw file at `?key=`. 404 when deployed. */
export const POST = bookingFileRoutes.receive;
