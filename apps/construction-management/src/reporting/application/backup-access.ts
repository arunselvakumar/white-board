import { can, type MemberAccess } from "@/src/shared-kernel/access";
import { DomainError, forbidden } from "@/src/shared-kernel/domain-error";

import {
  backupModule,
  backupModulesIn,
  type BackupModule,
} from "../domain/backup-modules";

/**
 * Who may back up what (ADR CM-0021 §8): a Project backup needs Project
 * View and View on each chosen module's menu on that Project; a master
 * records backup View on each master; amounts follow each module's money
 * rule. The full Company backup is the Owner's (checked by the route).
 */

/** Modules chosen, with whether each part may carry amounts. */
export type AllowedModules = { module: BackupModule; money: boolean }[];

function onProject(module: BackupModule, projectId: string | null) {
  return module.scope === "project" && projectId != null ? { projectId } : {};
}

/** The member's money right on a module (Financial, or View on finance menus). */
export function canSeeBackupMoney(
  access: MemberAccess,
  module: BackupModule,
  projectId: string | null,
): boolean {
  if (module.money == null) return false;
  return can(
    access,
    module.money.menu,
    module.money.flag,
    onProject(module, projectId),
  );
}

export function canBackUpModule(
  access: MemberAccess,
  module: BackupModule,
  projectId: string | null,
): boolean {
  if (module.menu == null) return access.role === "owner";
  return can(access, module.menu, "read", onProject(module, projectId));
}

function moduleDenied(module: BackupModule): DomainError {
  return new DomainError(
    "PERMISSION_DENIED",
    `You cannot back up ${module.label}: it needs View on ${module.label}. Ask the Owner to change your Permission Matrix.`,
    { kind: "forbidden", details: { module: module.key } },
  );
}

function checkedModules(
  keys: readonly string[],
  scope: "project" | "masters",
): BackupModule[] {
  const unique = [...new Set(keys)];
  if (unique.length === 0)
    throw new DomainError("BACKUP_MODULES_REQUIRED", "Choose at least one module.");
  return unique.map((key) => {
    const module = backupModule(key);
    if (module?.scope !== scope)
      throw new DomainError(
        "BACKUP_MODULE_UNKNOWN",
        `There is no ${scope === "project" ? "Project" : "master records"} module "${key}".`,
        { details: { module: key } },
      );
    return module;
  });
}

/**
 * A Project backup's modules, each with its money right, in registry
 * order. 403 without Project View, or naming the first module without
 * View; 400 for an unknown module or none.
 */
export function allowProjectBackup(
  access: MemberAccess,
  projectId: string,
  keys: readonly string[],
): AllowedModules {
  if (!can(access, "projects.project", "read", { projectId }))
    throw forbidden(
      "PERMISSION_DENIED",
      "You cannot back up this Project: it needs View on Project. Ask the Owner to change your Permission Matrix.",
    );
  return allow(access, projectId, checkedModules(keys, "project"), "project");
}

/** A master records backup's modules: View on each master. */
export function allowMastersBackup(
  access: MemberAccess,
  keys: readonly string[],
): AllowedModules {
  return allow(access, null, checkedModules(keys, "masters"), "masters");
}

function allow(
  access: MemberAccess,
  projectId: string | null,
  chosen: readonly BackupModule[],
  scope: "project" | "masters",
): AllowedModules {
  for (const module of chosen)
    if (!canBackUpModule(access, module, projectId)) throw moduleDenied(module);
  const keys = new Set(chosen.map((module) => module.key));
  return backupModulesIn(scope)
    .filter((module) => keys.has(module.key))
    .map((module) => ({
      module,
      money: canSeeBackupMoney(access, module, projectId),
    }));
}

/** What the backup dialogs offer the member, with the money right per module. */
export function backupOptions(
  access: MemberAccess,
  scope: "project" | "masters",
  projectId: string | null,
): { module: BackupModule; money: boolean }[] {
  if (scope === "project" && projectId != null && !can(access, "projects.project", "read", { projectId }))
    return [];
  return backupModulesIn(scope)
    .filter((module) => canBackUpModule(access, module, projectId))
    .map((module) => ({
      module,
      money: canSeeBackupMoney(access, module, projectId),
    }));
}
