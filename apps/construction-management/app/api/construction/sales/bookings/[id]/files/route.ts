import { bookingFileRoutes } from "../../booking-file-routes";

export const dynamic = "force-dynamic";

/** A booking's live files, oldest first (Booking read; personal data, never in the Gallery). */
export const GET = bookingFileRoutes.list;

/** Finishes an upload (step 3) as a Booking Form or a photo: 201, or 200 for a retry. */
export const POST = bookingFileRoutes.complete;
