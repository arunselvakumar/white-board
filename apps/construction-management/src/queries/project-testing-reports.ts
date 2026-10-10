import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProjectsTestingItemResponseModel,
  ConstructionProjectsTestingReportResponseModel,
  ListConstructionProjectsTestingItemsResponseModel,
  ListConstructionProjectsTestingReportsResponseModel,
} from "@/app/api/construction/projects/projects/[id]/testing-reports/testing-report-models";
import { checkUploadFile } from "@/lib/project-uploads";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson, QueryHttpError } from "./http";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type TestingItem = ConstructionProjectsTestingItemResponseModel;
export type TestingItemList = ListConstructionProjectsTestingItemsResponseModel;
export type TestingReport = ConstructionProjectsTestingReportResponseModel;
export type TestingReportPage =
  ListConstructionProjectsTestingReportsResponseModel;

/** `/api/construction/projects/projects/{id}/testing-reports` (CM-409). */
export function projectTestingReportsPath(projectId: string): string {
  return `${PROJECTS_API}/${encodeURIComponent(projectId)}/testing-reports`;
}

export function projectTestingReportsKey(projectId: string) {
  return [...PROJECTS_KEY, "testing-reports", projectId] as const;
}

/** The Project's testing items by name, with report counts. */
export function testingItemsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...projectTestingReportsKey(projectId), "items"],
    queryFn: () =>
      apiJson<TestingItemList>(`${projectTestingReportsPath(projectId)}/items`),
  });
}

export type TestingReportFilter = {
  search: string;
  cursor: { after: string } | { before: string } | null;
};

/** A page of an item's reports, newest report date first. */
export function testingReportsQuery(
  projectId: string,
  itemId: string,
  filter: TestingReportFilter,
) {
  const params = new URLSearchParams({ limit: "25" });
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [
      ...projectTestingReportsKey(projectId),
      "reports",
      itemId,
      params.toString(),
    ],
    queryFn: () =>
      apiJson<TestingReportPage>(
        `${projectTestingReportsPath(projectId)}/items/${encodeURIComponent(itemId)}/reports?${params.toString()}`,
      ),
  });
}

export type TestingReportDetails = {
  name: string;
  reportDate: string;
  remark: string | null;
};

/**
 * Adds a report: the file through `directUpload` (CM-407; a PDF or image
 * up to 25 MB), then the details with it.
 */
export async function addTestingReport(
  projectId: string,
  itemId: string,
  details: TestingReportDetails,
  file: File,
  options: UploadOptions = {},
): Promise<TestingReport> {
  const problem = checkUploadFile("testing_report", file);
  if (problem != null) throw new QueryHttpError(400, problem);
  const base = projectTestingReportsPath(projectId);
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<TestingReport>(
        `${base}/items/${encodeURIComponent(itemId)}/reports`,
        { ...details, key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

/** Edits a report; with `file`, uploads it first and replaces the report's. */
export async function updateTestingReport(
  projectId: string,
  reportId: string,
  details: TestingReportDetails & { updatedAt: string },
  file: File | null,
  options: UploadOptions = {},
): Promise<TestingReport> {
  const base = projectTestingReportsPath(projectId);
  const url = `${base}/reports/${encodeURIComponent(reportId)}/update`;
  if (file == null) return postJson<TestingReport>(url, details);
  const problem = checkUploadFile("testing_report", file);
  if (problem != null) throw new QueryHttpError(400, problem);
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<TestingReport>(
        url,
        {
          ...details,
          file: { key: started.key, fileName: started.fileName },
        },
        signal,
      ),
  });
}

function useRefresh(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: projectTestingReportsKey(projectId),
    });
}

export function useAddTestingItem(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (name: string) =>
      postJson<TestingItem>(`${projectTestingReportsPath(projectId)}/items`, {
        name,
      }),
    onSuccess: refresh,
  });
}

export function useRenameTestingItem(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (input: { itemId: string; name: string; updatedAt: string }) =>
      postJson<TestingItem>(
        `${projectTestingReportsPath(projectId)}/items/${encodeURIComponent(input.itemId)}/update`,
        { name: input.name, updatedAt: input.updatedAt },
      ),
    onSuccess: refresh,
  });
}

export function useDeleteTestingItem(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (itemId: string) =>
      postJson<undefined>(
        `${projectTestingReportsPath(projectId)}/items/${encodeURIComponent(itemId)}/delete`,
        {},
      ),
    onSuccess: refresh,
  });
}

/** Add (no `reportId`) or edit a report, with progress while a file goes up. */
export function useSaveTestingReport(projectId: string, itemId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (
      input: {
        reportId?: string;
        updatedAt?: string;
        details: TestingReportDetails;
        file: File | null;
      } & UploadOptions,
    ) => {
      const { reportId, updatedAt, details, file, ...options } = input;
      if (reportId == null || updatedAt == null) {
        if (file == null)
          throw new QueryHttpError(400, {
            code: "FILE_REQUIRED",
            message: "Choose the report file.",
          });
        return addTestingReport(projectId, itemId, details, file, options);
      }
      return updateTestingReport(
        projectId,
        reportId,
        { ...details, updatedAt },
        file,
        options,
      );
    },
    onSuccess: refresh,
  });
}

export function useDeleteTestingReport(projectId: string) {
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (reportId: string) =>
      postJson<undefined>(
        `${projectTestingReportsPath(projectId)}/reports/${encodeURIComponent(reportId)}/delete`,
        {},
      ),
    onSuccess: refresh,
  });
}
