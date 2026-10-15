import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersIssueCategoryResponseModel,
  ListConstructionMastersIssueCategoriesResponseModel,
} from "@/app/api/construction/masters/issue-categories/issue-category-models";
import type {
  ConstructionMastersTagResponseModel,
  ListConstructionMastersTagsResponseModel,
} from "@/app/api/construction/masters/tags/tag-models";

import { apiJson } from "./http";

export type IssueCategoryItem = ConstructionMastersIssueCategoryResponseModel;
export type TagItem = ConstructionMastersTagResponseModel;

/** Masters → Issue Categories and Tags (CM-801). */
export type TrackingMasterList = "issue-categories" | "tags";

export type TrackingMasterListBody = {
  "issue-categories": ListConstructionMastersIssueCategoriesResponseModel;
  tags: ListConstructionMastersTagsResponseModel;
};

export type TrackingMasterItem<L extends TrackingMasterList> =
  TrackingMasterListBody[L]["items"][number];

const MASTERS_API = "/api/construction/masters";

/** Every key of one list; the tracking forms' pickers read through tracking. */
export function trackingMasterKey(list: TrackingMasterList) {
  return ["masters", list] as const;
}

/** Every live row by name, with `inUse` and what the viewer may do. */
export function trackingMasterListQuery<L extends TrackingMasterList>(list: L) {
  return queryOptions({
    queryKey: [...trackingMasterKey(list), "list"] as const,
    queryFn: () => apiJson<TrackingMasterListBody[L]>(`${MASTERS_API}/${list}`),
  });
}

export type TrackingMasterCommand =
  | { kind: "create"; name: string }
  | { kind: "update"; id: string; name: string; expectedUpdatedAt: string }
  | { kind: "disable" | "enable" | "delete"; id: string };

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function runTrackingMasterCommand<L extends TrackingMasterList>(
  list: L,
  command: TrackingMasterCommand,
): Promise<TrackingMasterItem<L> | undefined> {
  const base = `${MASTERS_API}/${list}`;
  switch (command.kind) {
    case "create":
      return postJson(base, { name: command.name });
    case "update":
      return postJson(`${base}/${encodeURIComponent(command.id)}/update`, {
        name: command.name,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    default:
      return postJson(
        `${base}/${encodeURIComponent(command.id)}/${command.kind}`,
      );
  }
}

/** Add, rename, disable, enable and delete; refreshes the list. */
export function useTrackingMasterCommand<L extends TrackingMasterList>(
  list: L,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: TrackingMasterCommand) =>
      runTrackingMasterCommand(list, command),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: trackingMasterKey(list) }),
  });
}

/**
 * The Task form's inline tag create (Tags Create): the live Tag of the
 * name, or a new one. Refreshes the Tags list.
 */
export function useEnsureTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      postJson<TagItem>(`${MASTERS_API}/tags/ensure`, { name }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: trackingMasterKey("tags") }),
  });
}
