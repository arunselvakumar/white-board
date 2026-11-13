import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionMarketingProspectCompanyListItemResponse,
  ConstructionMarketingProspectCompanyResponse,
  CreateConstructionMarketingContactRequestModel,
  CreateConstructionMarketingProspectCompanyRequestModel,
  GetConstructionMarketingProspectCompanyFormOptionsResponse,
  ImportConstructionMarketingProspectCompaniesResponse,
  ListConstructionMarketingProspectCompaniesResponse,
  MoveConstructionMarketingProspectCompanyStageRequestModel,
  UpdateConstructionMarketingContactRequestModel,
  UpdateConstructionMarketingProspectCompanyRequestModel,
} from "@/app/api/construction/marketing/companies/company-models";
import { MARKETING_COMPANIES_PATH } from "@/lib/marketing-nav";
import type { Stage } from "@/src/marketing/domain/marketing-terms";

import { apiJson, QueryHttpError } from "./http";

export type ProspectCompany = ConstructionMarketingProspectCompanyResponse;
export type ProspectCompanyListItem =
  ConstructionMarketingProspectCompanyListItemResponse;
export type ProspectCompanyPage =
  ListConstructionMarketingProspectCompaniesResponse;
export type ProspectCompanyFormOptions =
  GetConstructionMarketingProspectCompanyFormOptionsResponse;
export type ProspectCompanyImportResult =
  ImportConstructionMarketingProspectCompaniesResponse;
export type ProspectCompanyContact = ProspectCompany["contacts"][number];
export type ProspectCompanyTimelineItem = ProspectCompany["timeline"][number];
export type CreateProspectCompanyInput = z.input<
  typeof CreateConstructionMarketingProspectCompanyRequestModel
>;
export type UpdateProspectCompanyInput = z.input<
  typeof UpdateConstructionMarketingProspectCompanyRequestModel
>;
export type MoveStageInput = z.input<
  typeof MoveConstructionMarketingProspectCompanyStageRequestModel
>;
export type CreateContactInput = z.input<
  typeof CreateConstructionMarketingContactRequestModel
>;
export type UpdateContactInput = z.input<
  typeof UpdateConstructionMarketingContactRequestModel
>;

export const MARKETING_COMPANIES_API = "/api/construction/marketing/companies";

/** Every Prospect Company read; writes invalidate it. */
export const MARKETING_COMPANIES_KEY = ["marketing", "companies"] as const;

/** Rows per page of the list. */
const PAGE_SIZE = 50;

export type CompanyFilters = {
  search?: string;
  stages?: readonly Stage[];
  assignedMemberId?: string;
  industry?: string;
};

/** The list's query string without the cursor (shared with the stories' mock). */
export function companyListParams(filters: CompanyFilters = {}) {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  const set = (key: string, value: string | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  set("search", filters.search?.trim());
  if (filters.stages != null && filters.stages.length > 0)
    params.set("stage", filters.stages.join(","));
  set("assignedMemberId", filters.assignedMemberId);
  set("industry", filters.industry);
  return params;
}

/** The Excel of the list with this search and filters (needs Companies export). */
export function companiesExportUrl(filters: CompanyFilters = {}): string {
  const params = companyListParams(filters);
  params.delete("limit");
  const query = params.toString();
  return `${MARKETING_COMPANIES_API}/export${query === "" ? "" : `?${query}`}`;
}

/** Prospect Companies A–Z, a page at a time ("Load more"). */
export function companiesQuery(filters: CompanyFilters = {}) {
  const params = companyListParams(filters);
  return infiniteQueryOptions({
    queryKey: [...MARKETING_COMPANIES_KEY, "list", params.toString()],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, meta }) => {
      const page = new URLSearchParams(params);
      if (pageParam != null) page.set("after", pageParam);
      return apiJson<ProspectCompanyPage>(
        `${MARKETING_COMPANIES_API}?${page.toString()}`,
        undefined,
        meta,
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Marketing People and the industries already typed. */
export const companyFormOptionsQuery = queryOptions({
  queryKey: [...MARKETING_COMPANIES_KEY, "form-options"],
  queryFn: ({ meta }) =>
    apiJson<ProspectCompanyFormOptions>(
      `${MARKETING_COMPANIES_API}/form-options`,
      undefined,
      meta,
    ),
});

export function companyQuery(id: string) {
  return queryOptions({
    queryKey: [...MARKETING_COMPANIES_KEY, "detail", id],
    queryFn: ({ meta }) =>
      apiJson<ProspectCompany>(
        `${MARKETING_COMPANIES_API}/${encodeURIComponent(id)}`,
        undefined,
        meta,
      ),
  });
}

/** The company page, or the list without an id. */
export function companyPath(id?: string): string {
  return id == null
    ? MARKETING_COMPANIES_PATH
    : `${MARKETING_COMPANIES_PATH}/${encodeURIComponent(id)}`;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${MARKETING_COMPANIES_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const item = (id: string, action: string) =>
  `/${encodeURIComponent(id)}/${action}`;

/**
 * Keeps the answered company as its page's data, then refreshes the lists
 * (Stage, Primary Contact and name show there).
 */
function useSaved() {
  const client = useQueryClient();
  return async (company: ProspectCompany) => {
    client.setQueryData(companyQuery(company.id).queryKey, company);
    await client.invalidateQueries({
      queryKey: MARKETING_COMPANIES_KEY,
      predicate: (query) => query.queryKey[2] !== "detail",
    });
  };
}

export function useCreateCompany() {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: CreateProspectCompanyInput) =>
      post<ProspectCompany>("", input),
    onSuccess: saved,
  });
}

export function useUpdateCompany(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: UpdateProspectCompanyInput) =>
      post<ProspectCompany>(item(id, "update"), input),
    onSuccess: saved,
  });
}

export function useMoveCompanyStage(id: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (input: MoveStageInput) =>
      post<ProspectCompany>(item(id, "stage"), input),
    onSuccess: saved,
  });
}

export function useDeleteCompany(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(item(id, "delete"), { expectedUpdatedAt }),
    onSuccess: async () => {
      // The open page still reads the company until it navigates away, so
      // its query is only marked stale, never refetched into a 404.
      await client.invalidateQueries({
        queryKey: MARKETING_COMPANIES_KEY,
        refetchType: "none",
      });
      await client.invalidateQueries({
        queryKey: MARKETING_COMPANIES_KEY,
        predicate: (query) => query.queryKey[2] !== "detail",
      });
    },
  });
}

/** The Excel template for the import (needs Companies import). */
export const COMPANY_IMPORT_TEMPLATE_URL = `${MARKETING_COMPANIES_API}/import-template`;

const XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Uploads the filled template: valid rows are created, duplicates and
 * invalid rows come back by row. The lists refresh when any was created,
 * and after a failure too: each row is saved on its own, so rows before
 * the failure may be in.
 */
export function useImportCompanies() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: Blob) =>
      apiJson<ProspectCompanyImportResult>(
        `${MARKETING_COMPANIES_API}/import`,
        { method: "POST", headers: { "content-type": XLSX }, body: file },
      ),
    onSettled: async (result) => {
      if (result == null || result.created > 0)
        await client.invalidateQueries({
          queryKey: MARKETING_COMPANIES_KEY,
          predicate: (query) => query.queryKey[2] !== "detail",
        });
    },
  });
}

export type ContactCommand =
  | { kind: "create"; input: CreateContactInput }
  | { kind: "update"; contactId: string; input: UpdateContactInput }
  | { kind: "delete"; contactId: string; expectedUpdatedAt: string };

/** Add, edit (or make primary) and remove a company's Contacts. */
export function useContactCommand(companyId: string) {
  const saved = useSaved();
  return useMutation({
    mutationFn: (command: ContactCommand) => {
      const base = `/${encodeURIComponent(companyId)}/contacts`;
      switch (command.kind) {
        case "create":
          return post<ProspectCompany>(base, command.input);
        case "update":
          return post<ProspectCompany>(
            `${base}/${encodeURIComponent(command.contactId)}/update`,
            command.input,
          );
        case "delete":
          return post<ProspectCompany>(
            `${base}/${encodeURIComponent(command.contactId)}/delete`,
            { expectedUpdatedAt: command.expectedUpdatedAt },
          );
      }
    },
    onSuccess: saved,
  });
}

/** `details.field` of an error envelope, when the server names one. */
export function errorField(error: unknown): string | null {
  if (!(error instanceof QueryHttpError)) return null;
  const field = (error.details as { field?: unknown } | undefined)?.field;
  return typeof field === "string" ? field : null;
}

/**
 * What to say for a failed write: a stale record (409 `*_CHANGED`) asks
 * for a reload; other refusals say the server's words.
 */
export function companyErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError) {
    if (error.code.endsWith("_CHANGED"))
      return "Someone else changed this Prospect Company after you opened it. Reload the page to see their changes, then try again.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
