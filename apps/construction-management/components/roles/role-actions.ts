/**
 * What the viewer may do on Role Management (`organization.roles`). Pages
 * read it on the server and hide the rest; the routes check again.
 */
export type RoleActions = { create: boolean; update: boolean; delete: boolean };

/** The Owner's, and every story's unless it says otherwise. */
export const ALL_ROLE_ACTIONS: RoleActions = {
  create: true,
  update: true,
  delete: true,
};
