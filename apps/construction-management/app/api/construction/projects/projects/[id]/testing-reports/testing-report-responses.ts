import type {
  TestingItemWithCount,
  TestingReportView,
} from "@/src/projects/application/project-testing-reports";
import type { TestingItem } from "@/src/projects/domain/testing-report";

import type {
  ConstructionProjectsTestingItemResponseModel,
  ConstructionProjectsTestingReportResponseModel,
} from "./testing-report-models";

/** `/api/construction/projects/projects/{id}/testing-reports`. */
export function testingReportsPath(projectId: string): string {
  return `/api/construction/projects/projects/${projectId}/testing-reports`;
}

/** A report's file route; the Gallery links here too. */
export function testingReportFilePath(
  projectId: string,
  reportId: string,
): string {
  return `${testingReportsPath(projectId)}/reports/${reportId}/file`;
}

export function testingReportThumbnailPath(
  projectId: string,
  reportId: string,
): string {
  return `${testingReportsPath(projectId)}/reports/${reportId}/thumbnail`;
}

export function toTestingItemResponse(
  item: TestingItem,
  reportCount: number,
): ConstructionProjectsTestingItemResponseModel {
  return {
    id: item.id,
    name: item.name,
    isSeed: item.isSeed,
    reportCount,
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toTestingItemListItem(
  item: TestingItemWithCount,
): ConstructionProjectsTestingItemResponseModel {
  return toTestingItemResponse(item, item.reportCount);
}

export function toTestingReportResponse(
  report: TestingReportView,
): ConstructionProjectsTestingReportResponseModel {
  return {
    id: report.id,
    itemId: report.itemId,
    name: report.name,
    reportDate: report.reportDate,
    remark: report.remark,
    fileName: report.fileName,
    contentType: report.contentType,
    bytes: report.bytes,
    viewable: report.viewable,
    url: testingReportFilePath(report.projectId, report.id),
    thumbUrl:
      report.thumbKey == null
        ? null
        : testingReportThumbnailPath(report.projectId, report.id),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    createdBy: report.createdBy,
    createdByName: report.createdByName,
  };
}
