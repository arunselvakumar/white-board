import { formatAge } from "@/src/preschool/domain/dates";

/** A Programme's ages: "3 y – 3 y 11 m", "From 2 y", "Up to 1 y 6 m", "No age limit". */
export function ageRangeLabel(min: number | null, max: number | null): string {
  if (min == null && max == null) return "No age limit";
  if (max == null) return `From ${formatAge(min ?? 0)}`;
  if (min == null) return `Up to ${formatAge(max)}`;
  return `${formatAge(min)} – ${formatAge(max)}`;
}
