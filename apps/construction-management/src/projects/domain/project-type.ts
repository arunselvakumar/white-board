/**
 * Project Types (ADR CM-0013 §1): a fixed list, because the type decides
 * whether the Project is structured as Wings or as Locations.
 */
export const PROJECT_TYPES = [
  { key: "residential", label: "Residential", structure: "wings" },
  { key: "commercial", label: "Commercial", structure: "wings" },
  { key: "mixed_use", label: "Mixed use", structure: "wings" },
  { key: "villas", label: "Villas / Bungalows", structure: "wings" },
  { key: "plotting", label: "Plotting / Layout", structure: "wings" },
  { key: "industrial", label: "Industrial", structure: "wings" },
  { key: "institutional", label: "Institutional", structure: "wings" },
  { key: "infrastructure", label: "Infrastructure", structure: "locations" },
  {
    key: "interiors",
    label: "Interiors / Renovation",
    structure: "locations",
  },
  { key: "other", label: "Other", structure: "locations" },
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number]["key"];

/** How a Project's places are kept: a building's Wings or a list of Locations. */
export type ProjectStructure = "wings" | "locations";

export const PROJECT_TYPE_KEYS: readonly ProjectType[] = PROJECT_TYPES.map(
  (type) => type.key,
);

export function isProjectType(value: string): value is ProjectType {
  return (PROJECT_TYPE_KEYS as readonly string[]).includes(value);
}

export function projectTypeLabel(type: ProjectType): string {
  return PROJECT_TYPES.find((item) => item.key === type)?.label ?? type;
}

/** The structure a Project Type suggests; a Project without a type has Wings. */
export function projectStructure(type: ProjectType | null): ProjectStructure {
  if (type == null) return "wings";
  return PROJECT_TYPES.find((item) => item.key === type)?.structure ?? "wings";
}
