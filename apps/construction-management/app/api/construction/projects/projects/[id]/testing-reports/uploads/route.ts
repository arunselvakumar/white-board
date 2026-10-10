import { testingReportUploadRoutes } from "../handlers";

export const dynamic = "force-dynamic";

/** Starts uploading a testing report's file (CM-409): a PDF or an image up to 25 MB. */
export const POST = testingReportUploadRoutes.start;
