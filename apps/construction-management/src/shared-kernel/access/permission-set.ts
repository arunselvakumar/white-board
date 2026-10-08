import { ALL_FLAGS_MASK, fromMask, hasFlag, toMask, type Flag } from "./flags";
import { MENUS, menuByKey, type MenuKey } from "./menus";

/** Grants as stored and sent: menu key → flags. */
export type PermissionGrants = Partial<Record<MenuKey, Flag[]>>;

/**
 * A Permission Matrix: which flags each menu grants (ADR CM-0003). Cells a
 * menu does not support are dropped, so the stored matrix can never hold a
 * right the API ignores.
 */
export class PermissionSet {
  private constructor(private readonly masks: ReadonlyMap<MenuKey, number>) {}

  static empty(): PermissionSet {
    return new PermissionSet(new Map());
  }

  /** From `{ menu: mask }` (storage). Unknown menus and unsupported bits are dropped. */
  static fromMasks(masks: Readonly<Record<string, number>>): PermissionSet {
    const clean = new Map<MenuKey, number>();
    for (const [key, mask] of Object.entries(masks)) {
      const menu = menuByKey(key);
      if (menu == null) continue;
      const allowed = mask & menu.supported & ALL_FLAGS_MASK;
      if (allowed !== 0) clean.set(menu.key, allowed);
    }
    return new PermissionSet(clean);
  }

  /** From `{ menu: ["create", …] }` (HTTP, seeds). */
  static fromGrants(
    grants: Readonly<Record<string, readonly Flag[]>>,
  ): PermissionSet {
    const masks: Record<string, number> = {};
    for (const [key, flags] of Object.entries(grants))
      masks[key] = toMask(flags);
    return PermissionSet.fromMasks(masks);
  }

  /** Every supported cell of every menu: the Owner's matrix. */
  static everything(): PermissionSet {
    return new PermissionSet(
      new Map(MENUS.map((menu) => [menu.key, menu.supported])),
    );
  }

  mask(menu: MenuKey): number {
    return this.masks.get(menu) ?? 0;
  }

  has(menu: MenuKey, flag: Flag): boolean {
    return hasFlag(this.mask(menu), flag);
  }

  toMasks(): Record<string, number> {
    return Object.fromEntries(this.masks);
  }

  toGrants(): PermissionGrants {
    const grants: PermissionGrants = {};
    for (const [key, mask] of this.masks) grants[key] = fromMask(mask);
    return grants;
  }

  equals(other: PermissionSet): boolean {
    const mine = this.toMasks();
    const theirs = other.toMasks();
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
    for (const key of keys)
      if ((mine[key] ?? 0) !== (theirs[key] ?? 0)) return false;
    return true;
  }

  /** Number of granted cells; the matrix shows it per category. */
  get size(): number {
    let count = 0;
    for (const mask of this.masks.values()) count += fromMask(mask).length;
    return count;
  }
}

/**
 * HRMS-only Team Members start here (ADR CM-0002): HRMS read; Holiday read;
 * Attendance create/read/notification; Leave create/read/notification;
 * Salary read.
 */
export const HRMS_DEFAULT_GRANTS = {
  "hrms.hrms": ["read"],
  "hrms.holidays": ["read"],
  "hrms.attendance": ["create", "read", "notification"],
  "hrms.leaves": ["create", "read", "notification"],
  "hrms.salaries": ["read"],
} as const satisfies Readonly<Record<string, readonly Flag[]>>;

export function hrmsDefaultPermissions(): PermissionSet {
  return PermissionSet.fromGrants(HRMS_DEFAULT_GRANTS);
}
