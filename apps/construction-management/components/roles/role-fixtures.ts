import type { Role } from "@/src/queries/roles";
import { hrmsDefaultPermissions } from "@/src/shared-kernel/access";

/** Story fixtures for Role Management and the Role pickers. */
export const ROLES_URL = "/api/construction/organization/roles";

const AT = "2026-10-08T06:30:00.000Z";

export function role(overrides: Partial<Role> = {}): Role {
  return {
    id: "0199c3a0-0000-7000-8000-000000000301",
    name: "Site Engineer",
    description: "Runs the site day to day: worksheets, attendance, requests.",
    isSeed: true,
    permissions: {
      "labour.attendance": ["create", "read", "update"],
      "procurement.purchase_requests": ["create", "read"],
    },
    userCount: 3,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

export const ADMIN_ROLE = role({
  id: "0199c3a0-0000-7000-8000-000000000300",
  name: "Admin",
  description: "Every menu, every action.",
  permissions: {
    "labour.attendance": ["create", "read", "update", "delete"],
    "procurement.purchase_requests": [
      "create",
      "read",
      "update",
      "delete",
      "approve",
    ],
    "organization.team_members": ["create", "read", "update", "delete"],
  },
  userCount: 1,
});

export const SITE_ENGINEER_ROLE = role();

export const ACCOUNTANT_ROLE = role({
  id: "0199c3a0-0000-7000-8000-000000000302",
  name: "Accountant",
  description: null,
  permissions: { "finance.transactions": ["create", "read"] },
  userCount: 0,
});

export const HRMS_STAFF_ROLE = role({
  id: "0199c3a0-0000-7000-8000-000000000303",
  name: "HRMS Staff",
  description: "Their own attendance, leave and salary.",
  permissions: hrmsDefaultPermissions().toGrants(),
  userCount: 2,
});

/** Made by the admin, not seeded. */
export const STORE_HELPER_ROLE = role({
  id: "0199c3a0-0000-7000-8000-000000000304",
  name: "Store helper",
  description: "Receives material at the site store.",
  isSeed: false,
  permissions: { "procurement.material_received": ["create", "read"] },
  userCount: 0,
});

export const ROLES: Role[] = [
  ADMIN_ROLE,
  ACCOUNTANT_ROLE,
  HRMS_STAFF_ROLE,
  SITE_ENGINEER_ROLE,
  STORE_HELPER_ROLE,
];
