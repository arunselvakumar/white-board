import { bookingFileRoutes } from "../../../booking-file-routes";

export const dynamic = "force-dynamic";

/** Starts a file upload on a booking (step 1): role, name, size, count and plan (Booking create or update). */
export const POST = bookingFileRoutes.start;
