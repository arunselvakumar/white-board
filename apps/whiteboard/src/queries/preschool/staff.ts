import { queryOptions } from "@tanstack/react-query";

import type {
  StaffInvitationOutcome,
  StaffInvitationView,
  StaffListView,
  StaffView,
} from "@/src/preschool/application/staff-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolStaff = StaffView;
export type PreschoolStaffList = StaffListView;
export type PreschoolStaffInvitation = StaffInvitationView;
export type PreschoolStaffInvitationOutcome = StaffInvitationOutcome;
export type PreschoolStaffRole = StaffView["role"];

/** Blank or omitted optional fields are cleared. */
export type PreschoolStaffDetailsInput = {
  name: string;
  role: PreschoolStaffRole;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  /** YYYY-MM-DD */
  joinedOn?: string | null;
};

export type CreatePreschoolStaffInput = PreschoolStaffDetailsInput & {
  centreId: string;
  /** Classrooms of the same Centre this member is Class Teacher of. */
  classroomIds?: string[];
};

const BASE = "/api/preschool/staff";

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const staffKeys = {
  all: [...preschoolKeys.all, "staff"] as const,
  list: (centreId: string) => [...staffKeys.all, "list", centreId] as const,
};

/** A Centre's Staff, active and inactive (Owner or Centre Head). */
export function staffQueryOptions(centreId: string) {
  return queryOptions({
    queryKey: staffKeys.list(centreId),
    queryFn: ({ meta }) =>
      apiJson<StaffListView>(
        `${BASE}?${new URLSearchParams({ centreId }).toString()}`,
        {},
        meta,
      ),
  });
}

/** Adds a Staff member; a Centre Head or Teacher with an email is invited. */
export function createStaff(
  body: CreatePreschoolStaffInput,
): Promise<StaffInvitationView> {
  return post<StaffInvitationView>("", body);
}

export function updateStaffDetails(
  id: string,
  body: PreschoolStaffDetailsInput,
): Promise<StaffView> {
  return post<StaffView>(`/${id}/details`, body);
}

export function deactivateStaff(id: string): Promise<StaffView> {
  return post<StaffView>(`/${id}/deactivate`);
}

export function activateStaff(id: string): Promise<StaffView> {
  return post<StaffView>(`/${id}/activate`);
}

export function inviteStaff(id: string): Promise<StaffInvitationView> {
  return post<StaffInvitationView>(`/${id}/invite`);
}
