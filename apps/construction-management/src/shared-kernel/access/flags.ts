/**
 * The rights a Permission Matrix cell can hold (ADR CM-0003). Bit positions
 * must never be reordered, because masks are stored.
 */
export const FLAGS = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "reject",
  "print",
  "report",
  "view_all",
  "notification",
  "transfer",
  "financial",
  "export",
  "import",
] as const;

export type Flag = (typeof FLAGS)[number];

/** One letter per flag, a compact notation for menu definitions (`modules/01` flag legend). */
export const FLAG_LETTERS: Record<string, Flag> = {
  C: "create",
  R: "read",
  U: "update",
  D: "delete",
  A: "approve",
  J: "reject",
  P: "print",
  O: "report",
  V: "view_all",
  N: "notification",
  T: "transfer",
  F: "financial",
  E: "export",
  I: "import",
};

/** Matrix column headings. */
export const FLAG_LABELS: Record<Flag, string> = {
  create: "Add",
  read: "View",
  update: "Edit",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  print: "Download",
  report: "Report",
  view_all: "View all",
  notification: "Notification",
  transfer: "Transfer",
  financial: "Financial",
  export: "Export",
  import: "Import",
};

export function flagBit(flag: Flag): number {
  return 1 << FLAGS.indexOf(flag);
}

export const ALL_FLAGS_MASK = (1 << FLAGS.length) - 1;

export function toMask(flags: Iterable<Flag>): number {
  let mask = 0;
  for (const flag of flags) mask |= flagBit(flag);
  return mask;
}

export function fromMask(mask: number): Flag[] {
  return FLAGS.filter((flag) => (mask & flagBit(flag)) !== 0);
}

export function hasFlag(mask: number, flag: Flag): boolean {
  return (mask & flagBit(flag)) !== 0;
}

export function isFlag(value: string): value is Flag {
  return (FLAGS as readonly string[]).includes(value);
}

/** `CRUDAPNO` → mask. */
export function maskFromLetters(letters: string): number {
  return toMask(
    [...letters].map((letter) => {
      const flag = FLAG_LETTERS[letter];
      if (flag == null) throw new Error(`Unknown flag letter ${letter}`);
      return flag;
    }),
  );
}
