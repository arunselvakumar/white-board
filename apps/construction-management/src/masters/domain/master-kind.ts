import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

/** The name-only lookup lists: same fields, same rules, their own table. */
export const LOOKUP_KINDS = ["labour_category", "department"] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

/** Every masters list this context owns (CM-203). */
export type MasterKind = LookupKind | "supervisor";

type MasterKindInfo = {
  /** Prefix of the list's error codes: `LABOUR_CATEGORY_NAME_IN_USE`. */
  code: string;
  /** The word on screens. */
  label: string;
  plural: string;
};

export const MASTER_KINDS: Record<MasterKind, MasterKindInfo> = {
  labour_category: {
    code: "LABOUR_CATEGORY",
    label: "Labour Category",
    plural: "Labour Categories",
  },
  department: {
    code: "DEPARTMENT",
    label: "Department",
    plural: "Departments",
  },
  supervisor: {
    code: "SUPERVISOR",
    label: "Supervisor",
    plural: "Supervisors",
  },
};

export const MASTER_NAME_MAX = 100;

/** Trims and collapses inner spaces; required and at most 100 characters. */
export function cleanMasterName(kind: MasterKind, raw: string): string {
  const { code, label } = MASTER_KINDS[kind];
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError(`${code}_NAME_REQUIRED`, `Enter the ${label} name.`);
  if (name.length > MASTER_NAME_MAX)
    throw new DomainError(
      `${code}_NAME_TOO_LONG`,
      `${label} name must be at most ${String(MASTER_NAME_MAX)} characters.`,
    );
  return name;
}

export function masterNotFound(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  return notFound(`${code}_NOT_FOUND`, `This ${label} was not found.`);
}

export function masterNameInUse(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  return conflict(
    `${code}_NAME_IN_USE`,
    `A ${label} with this name already exists.`,
  );
}

export function masterChanged(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  return conflict(
    `${code}_CHANGED`,
    `Someone else changed this ${label} after you opened it. Reload to see their changes.`,
  );
}

export function masterInUse(kind: MasterKind): DomainError {
  const { code, label } = MASTER_KINDS[kind];
  const users =
    kind === "supervisor"
      ? "Labours or attendance"
      : "Labours, Vendors or attendance";
  return conflict(
    `${code}_IN_USE`,
    `${users} use this ${label}, so it cannot be deleted. Disable it instead.`,
  );
}
