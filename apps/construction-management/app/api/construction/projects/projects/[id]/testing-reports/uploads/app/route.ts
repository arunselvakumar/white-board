import { testingReportUploadRoutes } from "../../handlers";

export const dynamic = "force-dynamic";

/** Development and tests: the raw file, kept at `?key=` on disk. */
export const POST = testingReportUploadRoutes.receive;
