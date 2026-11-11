import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionMastersSiteEngineerCreatedResponseModel,
  ConstructionMastersSiteEngineerPasswordResponseModel,
  ConstructionMastersSiteEngineerResponseModel,
  CreateConstructionMastersSiteEngineerRequestModel,
  ListConstructionMastersSiteEngineersResponseModel,
  UpdateConstructionMastersSiteEngineerRequestModel,
} from "@/app/api/construction/masters/site-engineers/site-engineer-models";

import { apiJson } from "./http";
import { supervisorsQuery } from "./masters";

const BASE = "/api/construction/masters/site-engineers";
/** Disable and Enable are the Site Engineer row's own, on the older routes. */
const SUPERVISORS_BASE = "/api/construction/masters/supervisors";

export type SiteEngineer = ConstructionMastersSiteEngineerResponseModel;
export type SiteEngineerSignIn = SiteEngineer["signIn"];
export type SiteEngineerCreated = z.infer<
  typeof ConstructionMastersSiteEngineerCreatedResponseModel
>;
export type SiteEngineerPasswordOutcome = z.infer<
  typeof ConstructionMastersSiteEngineerPasswordResponseModel
>;
export type SiteEngineerList = z.infer<
  typeof ListConstructionMastersSiteEngineersResponseModel
>;
/** The body as sent: `profile` and `projectIds` are optional on the wire. */
export type CreateSiteEngineerInput = z.input<
  typeof CreateConstructionMastersSiteEngineerRequestModel
>;
export type UpdateSiteEngineerInput = z.input<
  typeof UpdateConstructionMastersSiteEngineerRequestModel
>;

export const SITE_ENGINEERS_KEY = ["masters", "site-engineers"] as const;

export const siteEngineerQueries = {
  key: {
    all: SITE_ENGINEERS_KEY,
    list: () => [...SITE_ENGINEERS_KEY, "list"] as const,
    detail: (id: string) => [...SITE_ENGINEERS_KEY, "detail", id] as const,
  },
  /** Every live Site Engineer, disabled ones included, with how each signs in. */
  list: () =>
    queryOptions({
      queryKey: siteEngineerQueries.key.list(),
      queryFn: () => apiJson<SiteEngineerList>(BASE),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: siteEngineerQueries.key.detail(id),
      queryFn: () => apiJson<SiteEngineer>(`${BASE}/${encodeURIComponent(id)}`),
    }),
};

function post<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(id: string, verb: string, base = BASE): string {
  return `${base}/${encodeURIComponent(id)}/${verb}`;
}

/** Site Engineer lists and the Labour form's Site Engineer picker. */
function useInvalidateSiteEngineers() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: SITE_ENGINEERS_KEY }),
      queryClient.invalidateQueries({ queryKey: supervisorsQuery.queryKey }),
    ]);
}

/** Add Site Engineer: the record and their sign-in (ADR CM-0037). */
export function useCreateSiteEngineer() {
  const invalidate = useInvalidateSiteEngineers();
  return useMutation({
    mutationFn: (input: CreateSiteEngineerInput) =>
      post<SiteEngineerCreated>(BASE, input),
    onSuccess: invalidate,
  });
}

/** Edit Site Engineer; 409 `SUPERVISOR_CHANGED` when `expectedUpdatedAt` is stale. */
export function useUpdateSiteEngineer(id: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSiteEngineers();
  return useMutation({
    mutationFn: (input: UpdateSiteEngineerInput) =>
      post<SiteEngineer>(itemUrl(id, "update"), input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(siteEngineerQueries.key.detail(id), updated);
      await invalidate();
    },
  });
}

/** Sends their invitation again, with a fresh link. */
export function useResendSiteEngineerInvite(id: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSiteEngineers();
  return useMutation({
    mutationFn: () => post<SiteEngineer>(itemUrl(id, "resend-invite")),
    onSuccess: async (updated) => {
      queryClient.setQueryData(siteEngineerQueries.key.detail(id), updated);
      await invalidate();
    },
  });
}

/** A Temporary Password they replace at their next sign-in (ADR CM-0030 §7). */
export function useSetSiteEngineerPassword(id: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateSiteEngineers();
  return useMutation({
    mutationFn: (password: string) =>
      post<SiteEngineerPasswordOutcome>(itemUrl(id, "password"), {
        password,
      }),
    onSuccess: async (updated) => {
      const { passwordIgnored: _ignored, ...engineer } = updated;
      queryClient.setQueryData(siteEngineerQueries.key.detail(id), engineer);
      await invalidate();
    },
  });
}

export type SiteEngineerCommand = {
  kind: "disable" | "enable" | "delete";
  id: string;
};

/**
 * The list's row actions. Delete also takes back their own sign-in; Disable
 * and Enable only take them off and back on the pickers.
 */
export function useSiteEngineerCommand() {
  const invalidate = useInvalidateSiteEngineers();
  return useMutation({
    mutationFn: (command: SiteEngineerCommand) =>
      post<undefined>(
        command.kind === "delete"
          ? itemUrl(command.id, "delete")
          : itemUrl(command.id, command.kind, SUPERVISORS_BASE),
      ),
    onSettled: invalidate,
  });
}
