import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  siteWorkAccessOpenApiComponents,
  siteWorkAccessOpenApiOperations,
} from "./access/access-openapi";
import {
  siteWorkSettingsOpenApiComponents,
  siteWorkSettingsOpenApiOperations,
} from "./settings/settings-openapi";
import {
  worksheetOpenApiComponents,
  worksheetOpenApiOperations,
} from "./worksheets/worksheets-openapi";
import {
  equipmentOpenApiComponents,
  equipmentOpenApiOperations,
} from "./equipment/equipment-openapi";
import {
  equipmentSheetOpenApiComponents,
  equipmentSheetOpenApiOperations,
} from "./equipment-sheets/equipment-sheets-openapi";
import {
  siteDiaryOpenApiComponents,
  siteDiaryOpenApiOperations,
} from "./site-diary/site-diary-openapi";
import {
  hindranceOpenApiComponents,
  hindranceOpenApiOperations,
} from "./hindrances/hindrances-openapi";
import {
  progressReportOpenApiComponents,
  progressReportOpenApiOperations,
} from "./progress-reports/progress-reports-openapi";
import {
  siteWorkDocumentOpenApiComponents,
  siteWorkDocumentOpenApiOperations,
} from "./documents/documents-openapi";
import {
  siteWorkDashboardOpenApiComponents,
  siteWorkDashboardOpenApiOperations,
} from "./dashboard/dashboard-openapi";

/** Every site-work model (M6); each area owns its own file. */
export const siteWorkOpenApiComponents: OpenApiComponents = {
  ...siteWorkAccessOpenApiComponents,
  ...siteWorkSettingsOpenApiComponents,
  ...worksheetOpenApiComponents,
  ...equipmentOpenApiComponents,
  ...equipmentSheetOpenApiComponents,
  ...siteDiaryOpenApiComponents,
  ...hindranceOpenApiComponents,
  ...progressReportOpenApiComponents,
  ...siteWorkDocumentOpenApiComponents,
  ...siteWorkDashboardOpenApiComponents,
};

/** Every site-work operation (M6). */
export const siteWorkOpenApiOperations: OpenApiOperation[] = [
  ...siteWorkAccessOpenApiOperations,
  ...siteWorkSettingsOpenApiOperations,
  ...worksheetOpenApiOperations,
  ...equipmentOpenApiOperations,
  ...equipmentSheetOpenApiOperations,
  ...siteDiaryOpenApiOperations,
  ...hindranceOpenApiOperations,
  ...progressReportOpenApiOperations,
  ...siteWorkDocumentOpenApiOperations,
  ...siteWorkDashboardOpenApiOperations,
];
