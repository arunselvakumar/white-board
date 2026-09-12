export const INSTITUTION_TYPE_VALUES = [
  "school",
  "preschool",
  "college",
  "university",
  "training_institute",
  "other",
] as const;

export type InstitutionType = (typeof INSTITUTION_TYPE_VALUES)[number];

export const INSTITUTION_TYPES: readonly {
  value: InstitutionType;
  label: string;
}[] = [
  { value: "school", label: "School" },
  { value: "preschool", label: "Preschool" },
  { value: "college", label: "College" },
  { value: "university", label: "University" },
  { value: "training_institute", label: "Training Institute" },
  { value: "other", label: "Other" },
];
