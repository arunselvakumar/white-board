import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Folder colours on the Projects home (ADR CM-0026 §1): a fixed palette in
 * picker order. The keys are stored; the tints live in the UI.
 */
export const PROJECT_COLORS = [
  { key: "lavender", label: "Lavender" },
  { key: "peach", label: "Peach" },
  { key: "sky", label: "Sky" },
  { key: "mint", label: "Mint" },
  { key: "lemon", label: "Lemon" },
  { key: "rose", label: "Rose" },
  { key: "sand", label: "Sand" },
  { key: "slate", label: "Slate" },
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number]["key"];

export const PROJECT_COLOR_KEYS: readonly ProjectColor[] = PROJECT_COLORS.map(
  (color) => color.key,
);

/** Every new Project's colour; it does not rotate (ADR CM-0026 §1). */
export const DEFAULT_PROJECT_COLOR: ProjectColor = "lavender";

export function isProjectColor(value: string): value is ProjectColor {
  return (PROJECT_COLOR_KEYS as readonly string[]).includes(value);
}

/** Blank or null is the default, since a Project always has a colour. */
export function cleanProjectColor(
  raw: string | null | undefined,
): ProjectColor {
  const color = raw?.trim() ?? "";
  if (color === "") return DEFAULT_PROJECT_COLOR;
  if (!isProjectColor(color))
    throw new DomainError(
      "PROJECT_COLOR_INVALID",
      "Choose a colour from the palette.",
    );
  return color;
}
