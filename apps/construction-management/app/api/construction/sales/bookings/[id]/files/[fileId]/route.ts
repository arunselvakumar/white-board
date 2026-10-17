import { bookingFileRoutes } from "../../../booking-file-routes";

export const dynamic = "force-dynamic";

/** Streams a file (Booking read); `?download=1` saves it. */
export const GET = bookingFileRoutes.read;
