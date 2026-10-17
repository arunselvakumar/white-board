import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionSalesFunnelStageResponse,
  ConstructionSalesPickListItemResponse,
  GetConstructionSalesSettingsResponse,
} from "@/app/api/construction/sales/settings/settings-models";
import type { SalesListKind } from "@/src/sales/domain/sales-lists";

import { apiJson } from "./http";
import { SALES_API, SALES_KEY } from "./sales-access";

export type SalesSettings = GetConstructionSalesSettingsResponse;
export type FunnelStage = ConstructionSalesFunnelStageResponse;
export type SalesPickListItem = ConstructionSalesPickListItemResponse;

export const SALES_SETTINGS_API = `${SALES_API}/settings`;

/** Every sales settings read; the inquiry pickers read through it too (CM-1002). */
export function salesSettingsKey(projectId: string) {
  return [...SALES_KEY, "settings", projectId] as const;
}

/** A Project's Funnel Stages (in order), Lead Sources and Lost Reasons. */
export function salesSettingsQuery(projectId: string) {
  return queryOptions({
    queryKey: salesSettingsKey(projectId),
    queryFn: () =>
      apiJson<SalesSettings>(
        `${SALES_SETTINGS_API}?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/** The URL segment of each list. */
export const SALES_LIST_PATHS: Record<SalesListKind, string> = {
  funnel_stage: "funnel-stages",
  lead_source: "lead-sources",
  lost_reason: "lost-reasons",
};

export type SalesListCommand =
  | { kind: "create"; list: SalesListKind; name: string }
  | {
      kind: "rename";
      list: SalesListKind;
      id: string;
      name: string;
      expectedUpdatedAt: string;
    }
  | { kind: "move"; id: string; direction: "up" | "down" }
  | {
      kind: "disable" | "enable";
      list: Exclude<SalesListKind, "funnel_stage">;
      id: string;
    }
  | { kind: "delete"; list: SalesListKind; id: string };

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${SALES_SETTINGS_API}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function runSalesListCommand(
  projectId: string,
  command: SalesListCommand,
): Promise<unknown> {
  const item = (list: SalesListKind, id: string, action: string) =>
    `${SALES_LIST_PATHS[list]}/${encodeURIComponent(id)}/${action}`;
  switch (command.kind) {
    case "create":
      return post(SALES_LIST_PATHS[command.list], {
        projectId,
        name: command.name,
      });
    case "rename":
      return post(item(command.list, command.id, "update"), {
        name: command.name,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "move":
      return post(item("funnel_stage", command.id, "move"), {
        direction: command.direction,
      });
    case "disable":
    case "enable":
    case "delete":
      return post(item(command.list, command.id, command.kind));
  }
}

/** Add, rename, move, disable, enable and delete; refreshes the lists and pickers. */
export function useSalesListCommand(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: SalesListCommand) =>
      runSalesListCommand(projectId, command),
    onSuccess: (result, command) => {
      // A move answers with the new order: show it before the refetch.
      if (command.kind !== "move") return;
      const { items } = result as { items: FunnelStage[] };
      queryClient.setQueryData<SalesSettings>(
        salesSettingsKey(projectId),
        (current) =>
          current == null ? current : { ...current, funnelStages: items },
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...SALES_KEY] }),
  });
}

/** The Settings tab of a Project's Inquiries module. */
export function salesSettingsPath(projectId: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/inquiries/settings`;
}
