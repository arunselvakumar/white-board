import type { Metadata } from "next";

import { viewerFlags } from "@/app/app/_lib/viewer-can";
import { RolesNoAccess } from "@/app/app/staff/_components/roles-no-access";
import { MANAGE_DEPARTMENTS } from "@/lib/departments-nav";

import { DepartmentsList } from "./_components/departments-list";

export const metadata: Metadata = { title: MANAGE_DEPARTMENTS.label };

/**
 * Manage Departments (ADR CM-0049): the Company's departments, with Add,
 * Rename and Delete as the Role's Departments menu allows. Every route
 * checks again.
 */
export default async function ManageDepartmentsPage() {
  const actions = await viewerFlags("organization.departments", [
    "read",
    "create",
    "update",
    "delete",
  ]);
  if (!actions.read) return <RolesNoAccess what={MANAGE_DEPARTMENTS.label} />;
  return <DepartmentsList actions={actions} />;
}
