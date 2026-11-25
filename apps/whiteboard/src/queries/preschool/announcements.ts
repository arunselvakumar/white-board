import { queryOptions } from "@tanstack/react-query";

import type {
  AnnouncementContentInput,
  CreateAnnouncementInput,
} from "@/src/preschool/application/announcement-handlers";
import type {
  AnnouncementPageView,
  AnnouncementView,
  FamilyAnnouncementsView,
} from "@/src/preschool/application/announcement-views";
import type { AnnouncementKind } from "@/src/preschool/domain/announcement";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolAnnouncement = AnnouncementView;
export type PreschoolAnnouncementPage = AnnouncementPageView;
export type PreschoolFamilyAnnouncements = FamilyAnnouncementsView;
export type PreschoolAnnouncementKind = AnnouncementKind;
export type CreatePreschoolAnnouncementInput = CreateAnnouncementInput;
export type UpdatePreschoolAnnouncementInput = AnnouncementContentInput;

const BASE = "/api/preschool/announcements";

export const preschoolAnnouncementKeys = {
  all: [...preschoolKeys.all, "announcements"] as const,
  list: (centreId: string, kind?: AnnouncementKind, cursor?: string) =>
    [
      ...preschoolAnnouncementKeys.all,
      "list",
      centreId,
      kind ?? null,
      cursor ?? null,
    ] as const,
  upcoming: (centreId: string) =>
    [...preschoolAnnouncementKeys.all, "upcoming", centreId] as const,
  family: (cursor?: string) =>
    [...preschoolAnnouncementKeys.all, "family", cursor ?? null] as const,
};

function search(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") params.set(key, value);
  return params.toString();
}

export function preschoolAnnouncementsQueryOptions(
  centreId: string,
  kind?: AnnouncementKind,
  cursor?: string,
) {
  return queryOptions({
    queryKey: preschoolAnnouncementKeys.list(centreId, kind, cursor),
    queryFn: ({ meta }) =>
      apiJson<PreschoolAnnouncementPage>(
        `${BASE}?${search({ centreId, kind, cursor })}`,
        {},
        meta,
      ),
  });
}

export function preschoolUpcomingAnnouncementsQueryOptions(centreId: string) {
  return queryOptions({
    queryKey: preschoolAnnouncementKeys.upcoming(centreId),
    queryFn: ({ meta }) =>
      apiJson<{ items: PreschoolAnnouncement[] }>(
        `${BASE}/upcoming?${search({ centreId })}`,
        {},
        meta,
      ),
  });
}

/** A Parent's Announcements (their Children's Centres and Classrooms). */
export function preschoolFamilyAnnouncementsQueryOptions(cursor?: string) {
  return queryOptions({
    queryKey: preschoolAnnouncementKeys.family(cursor),
    queryFn: ({ meta }) =>
      apiJson<PreschoolFamilyAnnouncements>(
        `${BASE}/family?${search({ cursor })}`,
        {},
        meta,
      ),
  });
}

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createPreschoolAnnouncement(
  input: CreatePreschoolAnnouncementInput,
): Promise<PreschoolAnnouncement> {
  return post("", input);
}

export function updatePreschoolAnnouncement(
  id: string,
  input: UpdatePreschoolAnnouncementInput,
): Promise<PreschoolAnnouncement> {
  return post(`/${id}/details`, input);
}

export function removePreschoolAnnouncement(id: string): Promise<void> {
  return post(`/${id}/remove`);
}

export const PRESCHOOL_ANNOUNCEMENT_KIND_LABELS: Record<
  AnnouncementKind,
  string
> = { notice: "Notice", event: "Event", holiday: "Holiday" };
