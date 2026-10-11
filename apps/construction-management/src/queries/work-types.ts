import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersWorkTypeResponseModel,
  CreateConstructionMastersWorkTypeRequestModel,
  ListConstructionMastersWorkTypesResponseModel,
} from "@/app/api/construction/masters/work-types/work-type-models";

import { apiJson } from "./http";

export type WorkTypeItem = ConstructionMastersWorkTypeResponseModel;

/** What the form sends to add or change a Work Type. */
export type WorkTypeInput = CreateConstructionMastersWorkTypeRequestModel;

export const WORK_TYPES_API = "/api/construction/masters/work-types";

/** Every Work Type key starts here, so one invalidation covers the master. */
export const WORK_TYPES_KEY = ["masters", "work-types"] as const;

/**
 * The Company's live Work Types by name, each with its Department and
 * Materials; `enabled` for pickers (a worksheet's Work Type), `all` for the
 * master's screen.
 */
export function workTypesQuery(status: "all" | "enabled" = "all") {
  return queryOptions({
    queryKey: [...WORK_TYPES_KEY, "list", status] as const,
    queryFn: () =>
      apiJson<ListConstructionMastersWorkTypesResponseModel>(
        status === "all" ? WORK_TYPES_API : `${WORK_TYPES_API}?status=enabled`,
      ),
  });
}

export type WorkTypeCommand =
  | { kind: "create"; input: WorkTypeInput }
  | {
      kind: "update";
      id: string;
      input: WorkTypeInput;
      expectedUpdatedAt: string;
    }
  | { kind: "disable" | "enable" | "delete"; id: string };

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function runWorkTypeCommand(
  command: WorkTypeCommand,
): Promise<WorkTypeItem | undefined> {
  switch (command.kind) {
    case "create":
      return postJson(WORK_TYPES_API, command.input);
    case "update":
      return postJson(
        `${WORK_TYPES_API}/${encodeURIComponent(command.id)}/update`,
        { ...command.input, expectedUpdatedAt: command.expectedUpdatedAt },
      );
    default:
      return postJson(
        `${WORK_TYPES_API}/${encodeURIComponent(command.id)}/${command.kind}`,
      );
  }
}

/** Add, change, disable, enable and delete a Work Type. */
export function useWorkTypeCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runWorkTypeCommand,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: WORK_TYPES_KEY }),
  });
}
