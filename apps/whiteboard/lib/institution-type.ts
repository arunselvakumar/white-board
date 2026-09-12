export const INSTITUTION_TYPE_VALUES = [
  "school",
  "preschool",
  "college",
  "university",
  "training_institute",
  "other",
] as const;

export type InstitutionType = (typeof INSTITUTION_TYPE_VALUES)[number];

export const AVAILABLE_INSTITUTION_TYPE_VALUES = [
  "training_institute",
] as const satisfies readonly InstitutionType[];

export type AvailableInstitutionType =
  (typeof AVAILABLE_INSTITUTION_TYPE_VALUES)[number];

export const DEFAULT_INSTITUTION_TYPE: AvailableInstitutionType =
  "training_institute";

export function isAvailableInstitutionType(
  value: string,
): value is AvailableInstitutionType {
  return (AVAILABLE_INSTITUTION_TYPE_VALUES as readonly string[]).includes(
    value,
  );
}

export const INSTITUTION_TYPES: readonly {
  value: InstitutionType;
  label: string;
  available: boolean;
}[] = [
  { value: "school", label: "School", available: false },
  { value: "preschool", label: "Preschool", available: false },
  { value: "college", label: "College", available: false },
  { value: "university", label: "University", available: false },
  { value: "training_institute", label: "Training Institute", available: true },
  { value: "other", label: "Other", available: false },
];
