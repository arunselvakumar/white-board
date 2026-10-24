import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionOrganizationRoleResponseModel } from "@/app/api/construction/organization/roles/role-models";
import type { PermissionGrants } from "@/src/shared-kernel/access";

import { apiJson } from "./http";
import { TEAM_MEMBERS_KEY } from "./team-members";

/** A Role: a named Permission Matrix given to Team Members (ADR CM-0030 §1). */
export type Role = ConstructionOrganizationRoleResponseModel;

export type RoleInput = {
  name: string;
  description: string | null;
  permissions: PermissionGrants;
};

const BASE = "/api/construction/organization/roles";

/** Every Role query key starts here, so one invalidation covers them. */
export const ROLES_KEY = ["organization", "roles"] as const;

/** Every Role, sorted by name (Role Management and the Role pickers). */
export const rolesQuery = queryOptions({
  queryKey: [...ROLES_KEY, "list"],
  queryFn: async () => (await apiJson<{ items: Role[] }>(BASE)).items,
});

export function roleQuery(id: string) {
  return queryOptions({
    queryKey: [...ROLES_KEY, "detail", id],
    queryFn: () => apiJson<Role>(`${BASE}/${encodeURIComponent(id)}`),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function createRole(input: RoleInput): Promise<Role> {
  return postJson(BASE, input);
}

/** `updatedAt` is the version the form loaded; a newer one answers 409 STALE_ROLE. */
export function updateRole(
  id: string,
  input: RoleInput & { updatedAt: string },
): Promise<Role> {
  return postJson(`${BASE}/${encodeURIComponent(id)}/update`, input);
}

export function duplicateRole(id: string): Promise<Role> {
  return postJson(`${BASE}/${encodeURIComponent(id)}/duplicate`);
}

export function deleteRole(id: string): Promise<void> {
  return postJson(`${BASE}/${encodeURIComponent(id)}/delete`);
}

/** A Role change also changes what its Team Members' responses carry. */
function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ROLES_KEY }),
      queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY }),
    ]);
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: createRole, onSuccess: invalidate });
}

export function useUpdateRole(id: string) {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (input: RoleInput & { updatedAt: string }) =>
      updateRole(id, input),
    onSuccess: invalidate,
  });
}

export function useDuplicateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: duplicateRole, onSuccess: invalidate });
}

/** Refreshes on a refusal too: a ROLE_IN_USE means the counts were stale. */
export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({ mutationFn: deleteRole, onSettled: invalidate });
}
