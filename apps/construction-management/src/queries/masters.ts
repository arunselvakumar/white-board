import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { LookupResponseModel } from "@/app/api/construction/masters/_lib/master-models";
import type { LabourSkill } from "@/src/masters/domain/master-kind";

import { apiJson } from "./http";

const BASE = "/api/construction/masters";

/** The name-only lists with their own screen: Labour Categories. */
export type LookupList = "labour-categories";

/** A lookup row; Labour Categories carry their `skill` (CM-601). */
export type LookupItem = LookupResponseModel;

/** Every masters query key starts here, so one invalidation covers a list. */
const MASTERS_KEY = ["masters"] as const;

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(list: string, id: string, verb?: string): string {
  const path = `${BASE}/${list}/${encodeURIComponent(id)}`;
  return verb == null ? path : `${path}/${verb}`;
}

/** Every live row of a lookup list, disabled ones included, by name. */
export function lookupListQuery(list: LookupList) {
  return queryOptions({
    queryKey: [...MASTERS_KEY, list, "list"],
    queryFn: () =>
      apiJson<{ items: LookupItem[]; total: number }>(`${BASE}/${list}`),
  });
}

export type LookupCommand =
  | { kind: "create"; name: string; skill?: LabourSkill }
  | {
      kind: "rename";
      id: string;
      name: string;
      expectedUpdatedAt: string;
      skill?: LabourSkill;
    }
  | { kind: "disable" | "enable" | "delete"; id: string };

export function runLookupCommand(
  list: LookupList,
  command: LookupCommand,
): Promise<LookupItem | undefined> {
  switch (command.kind) {
    case "create":
      return postJson(`${BASE}/${list}`, {
        name: command.name,
        ...(command.skill == null ? {} : { skill: command.skill }),
      });
    case "rename":
      return postJson(itemUrl(list, command.id, "update"), {
        name: command.name,
        expectedUpdatedAt: command.expectedUpdatedAt,
        ...(command.skill == null ? {} : { skill: command.skill }),
      });
    default:
      return postJson(itemUrl(list, command.id, command.kind));
  }
}

/** Add, rename, disable, enable and delete on a lookup list. */
export function useLookupCommand(list: LookupList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: LookupCommand) => runLookupCommand(list, command),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...MASTERS_KEY, list] }),
  });
}
