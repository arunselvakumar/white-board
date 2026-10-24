import { ShieldCheck, Users, type LucideIcon } from "lucide-react";

export type UsersRolesSection = {
  href: string;
  /** Sidebar label. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const USERS_PATH = "/app/users";
export const ROLES_PATH = "/app/roles";

/**
 * Users & Roles in the main menu (ADR CM-0030 §2): the people who work in
 * the Company, and the Roles that decide what they may do.
 */
export const USERS_ROLES_SECTIONS: readonly UsersRolesSection[] = [
  {
    href: USERS_PATH,
    label: "Users",
    title: "Users",
    description:
      "Your team: their details, Projects, Role and how they sign in.",
    icon: Users,
  },
  {
    href: ROLES_PATH,
    label: "Role Management",
    title: "Role Management",
    description:
      "Roles and their Permission Matrix. Editing a Role changes access for everyone on it.",
    icon: ShieldCheck,
  },
];

/** The Users & Roles section a path belongs to (its page or anything under it). */
export function activeUsersRolesSection(
  pathname: string,
): UsersRolesSection | undefined {
  return USERS_ROLES_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}

export function userPath(id: string): string {
  return `${USERS_PATH}/${encodeURIComponent(id)}`;
}

export function rolePath(id: string): string {
  return `${ROLES_PATH}/${encodeURIComponent(id)}`;
}
