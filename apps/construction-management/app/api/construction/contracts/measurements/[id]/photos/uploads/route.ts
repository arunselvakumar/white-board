import { measurementPhotoUploadRoutes } from "../../../measurement-photo-routes";

export const dynamic = "force-dynamic";

/** Starts a photo upload on a sheet (step 1): name, size, count and plan. */
export const POST = measurementPhotoUploadRoutes.start;
