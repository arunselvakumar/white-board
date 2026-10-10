import { createPlanGate } from "@/src/organization/infrastructure/create-subscription-handlers";
import { TESTING_REPORT_MAX_BYTES } from "@/src/projects/domain/project-upload-policies";
import { createProjectTestingReports } from "@/src/projects/infrastructure/create-project-testing-reports";

import { projectUploadRoutes } from "../../../project-upload-routes";
import { StartConstructionProjectsTestingReportUploadRequestModel } from "./testing-report-models";
import { testingReportsPath } from "./testing-report-responses";

/** One composition for the Testing Reports routes (CM-409). */
export const projectTestingReports = createProjectTestingReports({
  plan: createPlanGate(),
});

/**
 * Testing Reports' upload routes on the attachments service (CM-407): a
 * new report needs Create, replacing a report's file Update.
 */
export const testingReportUploadRoutes = projectUploadRoutes({
  menu: "projects.testing_reports",
  flags: ["create", "update"],
  owner: projectTestingReports,
  basePath: testingReportsPath,
  startModel: StartConstructionProjectsTestingReportUploadRequestModel,
  maxBytes: TESTING_REPORT_MAX_BYTES,
});
