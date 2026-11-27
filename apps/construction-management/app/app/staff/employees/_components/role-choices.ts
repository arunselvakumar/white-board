/**
 * The Department and Role choices of the Employee form and list (ADR
 * CM-0055 §2): a Role is under one Department or none, and the Department
 * is read from the Role.
 */

/** The "No department" choice: Roles under no Department. */
export const NO_DEPARTMENT = "__no_department";

export type RoleOption = {
  id: string;
  name: string;
  department: { id: string; name: string } | null;
};

export type Choice = { value: string; label: string };

/**
 * The Company's live Departments by name, then "No department" when a live
 * Role is under none.
 */
export function departmentChoices(
  departments: readonly { id: string; name: string }[],
  roles: readonly RoleOption[],
): Choice[] {
  const choices = [...departments]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((department) => ({ value: department.id, label: department.name }));
  if (roles.some((role) => role.department == null))
    choices.push({ value: NO_DEPARTMENT, label: "No department" });
  return choices;
}

/** The live Roles under a Department choice, by name. */
export function rolesUnder(
  roles: readonly RoleOption[],
  departmentId: string,
): RoleOption[] {
  if (departmentId === "") return [];
  return roles
    .filter((role) =>
      departmentId === NO_DEPARTMENT
        ? role.department == null
        : role.department?.id === departmentId,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Where Add Employee starts: Human Resources → Labour, the most common
 * case; blank when the Company renamed or deleted either.
 */
export function defaultRoleAssignment(roles: readonly RoleOption[]): {
  departmentId: string;
  roleId: string;
} {
  const labour = roles.find(
    (role) =>
      role.name.toLowerCase() === "labour" &&
      role.department?.name.toLowerCase() === "human resources",
  );
  if (labour?.department == null) return { departmentId: "", roleId: "" };
  return { departmentId: labour.department.id, roleId: labour.id };
}
