import {
  MENU_CATEGORIES,
  fromMask,
  hasFlag,
  toMask,
  type Flag,
  type Menu,
  type MenuCategory,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

/**
 * Pure helpers behind the Permission Matrix component (ADR CM-0003). Values
 * are `PermissionGrants` (`{ menu: flags }`); every helper returns a new
 * object, keeps flags in catalogue order, never grants a cell the menu does
 * not support, and drops menus left with no flags.
 */

/** Whether every, some or none of the cells in a group are granted. */
export type GroupState = "all" | "some" | "none";

export type MatrixCategory = {
  key: MenuCategory;
  label: string;
  menus: readonly Menu[];
};

export function maskOf(grants: PermissionGrants, menu: Menu): number {
  return toMask(grants[menu.key] ?? []) & menu.supported;
}

function withMask(
  grants: PermissionGrants,
  menu: Menu,
  mask: number,
): PermissionGrants {
  const clean = mask & menu.supported;
  const next: PermissionGrants = Object.fromEntries(
    Object.entries(grants).filter(([key]) => key !== menu.key),
  );
  if (clean !== 0) next[menu.key] = fromMask(clean);
  return next;
}

export function supports(menu: Menu, flag: Flag): boolean {
  return hasFlag(menu.supported, flag);
}

/** Grants or removes one cell. */
export function toggleCell(
  grants: PermissionGrants,
  menu: Menu,
  flag: Flag,
  on: boolean,
): PermissionGrants {
  if (!supports(menu, flag)) return grants;
  const mask = maskOf(grants, menu);
  const bit = toMask([flag]);
  return withMask(grants, menu, on ? mask | bit : mask & ~bit);
}

/** One flag for every menu in the group that supports it. */
export function setColumn(
  grants: PermissionGrants,
  menus: readonly Menu[],
  flag: Flag,
  on: boolean,
): PermissionGrants {
  let next = grants;
  for (const menu of menus) next = toggleCell(next, menu, flag, on);
  return next;
}

/** Every supported cell of every menu in the group. */
export function setGroup(
  grants: PermissionGrants,
  menus: readonly Menu[],
  on: boolean,
): PermissionGrants {
  let next = grants;
  for (const menu of menus)
    next = withMask(next, menu, on ? menu.supported : 0);
  return next;
}

function stateOf(granted: number, total: number): GroupState {
  if (granted === 0) return "none";
  return granted === total ? "all" : "some";
}

/** The column's state over the menus that support the flag; null if none do. */
export function columnState(
  grants: PermissionGrants,
  menus: readonly Menu[],
  flag: Flag,
): GroupState | null {
  let total = 0;
  let granted = 0;
  for (const menu of menus) {
    if (!supports(menu, flag)) continue;
    total += 1;
    if (hasFlag(maskOf(grants, menu), flag)) granted += 1;
  }
  return total === 0 ? null : stateOf(granted, total);
}

export function supportedCount(menus: readonly Menu[]): number {
  let count = 0;
  for (const menu of menus) count += fromMask(menu.supported).length;
  return count;
}

export function grantedCount(
  grants: PermissionGrants,
  menus: readonly Menu[],
): number {
  let count = 0;
  for (const menu of menus) count += fromMask(maskOf(grants, menu)).length;
  return count;
}

export function groupState(
  grants: PermissionGrants,
  menus: readonly Menu[],
): GroupState {
  return stateOf(grantedCount(grants, menus), supportedCount(menus));
}

/** Menus whose label contains the query, ignoring case and extra spaces. */
export function filterMenus(
  menus: readonly Menu[],
  query: string,
): readonly Menu[] {
  const needle = query.trim().replace(/\s+/g, " ").toLowerCase();
  if (needle === "") return menus;
  return menus.filter((menu) => menu.label.toLowerCase().includes(needle));
}

/** Menus grouped in the matrix's category order; empty categories are left out. */
export function byCategory(menus: readonly Menu[]): MatrixCategory[] {
  return MENU_CATEGORIES.map((category) => ({
    key: category.key,
    label: category.label,
    menus: menus.filter((menu) => menu.category === category.key),
  })).filter((category) => category.menus.length > 0);
}
