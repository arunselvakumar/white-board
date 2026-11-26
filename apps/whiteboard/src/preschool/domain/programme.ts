import { invalid } from "./errors";

/** Upper bound for a Programme's age range: 10 years. */
export const MAX_PROGRAMME_AGE_MONTHS = 120;

export type ProgrammeFields = {
  name: string;
  /** Completed months on the first day of the Academic Year. Null is no limit. */
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isDaycare: boolean;
};

/** Trims the name and checks the age range; throws 400 when either is wrong. */
export function programmeFields(input: ProgrammeFields): ProgrammeFields {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name === "")
    throw invalid("PROGRAMME_NAME_REQUIRED", "Enter the Programme's name.");
  if (name.length > 100)
    throw invalid(
      "PROGRAMME_NAME_TOO_LONG",
      "A Programme's name can be at most 100 characters.",
    );
  for (const months of [input.minAgeMonths, input.maxAgeMonths])
    if (
      months != null &&
      (!Number.isInteger(months) ||
        months < 0 ||
        months > MAX_PROGRAMME_AGE_MONTHS)
    )
      throw invalid(
        "PROGRAMME_AGE_RANGE_INVALID",
        `An age must be 0 to ${MAX_PROGRAMME_AGE_MONTHS} months.`,
      );
  if (
    input.minAgeMonths != null &&
    input.maxAgeMonths != null &&
    input.minAgeMonths > input.maxAgeMonths
  )
    throw invalid(
      "PROGRAMME_AGE_RANGE_INVALID",
      "The youngest age must not be above the oldest age.",
    );
  return { ...input, name };
}

/** Names compare without case or repeated spaces. */
export function programmeNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The new order of a Workspace's Programmes. `orderedIds` must list every
 * Programme that is not archived, once; archived ones follow in their old
 * order. Returns every id in its new position.
 */
export function reorderProgrammes(
  current: readonly { id: string; archived: boolean }[],
  orderedIds: readonly string[],
): string[] {
  const active = current.filter((programme) => !programme.archived);
  const activeIds = new Set(active.map((programme) => programme.id));
  const unique = new Set(orderedIds);
  if (
    unique.size !== orderedIds.length ||
    orderedIds.length !== activeIds.size ||
    orderedIds.some((id) => !activeIds.has(id))
  )
    throw invalid(
      "PROGRAMME_ORDER_INVALID",
      "List every Programme that is not archived, once.",
    );
  return [
    ...orderedIds,
    ...current
      .filter((programme) => programme.archived)
      .map((programme) => programme.id),
  ];
}
