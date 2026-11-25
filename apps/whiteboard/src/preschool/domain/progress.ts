import { addDays, addMonths, type IsoDate } from "./dates";
import { conflict, invalid } from "./errors";

export const TERMS = ["term_1", "term_2", "term_3"] as const;
export type Term = (typeof TERMS)[number];

export const PROGRESS_RATINGS = [
  "beginning",
  "progressing",
  "proficient",
] as const;
export type ProgressRating = (typeof PROGRESS_RATINGS)[number];

export type ProgressReportStatus = "draft" | "published";

export const TERM_LABELS: Record<Term, string> = {
  term_1: "Term 1",
  term_2: "Term 2",
  term_3: "Term 3",
};

export const MAX_OBSERVATION_LENGTH = 2000;
export const MAX_REMARK_LENGTH = 500;

/**
 * A term's first and last day: the Academic Year in thirds, four months
 * each from its first day, the last ending with the year.
 */
export function termSpan(
  year: { startsOn: IsoDate; endsOn: IsoDate },
  term: Term,
): { startsOn: IsoDate; endsOn: IsoDate } {
  const index = TERMS.indexOf(term);
  const startsOn = addMonths(year.startsOn, index * 4);
  const endsOn =
    index === TERMS.length - 1
      ? year.endsOn
      : addDays(addMonths(year.startsOn, (index + 1) * 4), -1);
  return { startsOn, endsOn };
}

/** The term a date falls in, or null outside the year. */
export function termOn(
  year: { startsOn: IsoDate; endsOn: IsoDate },
  date: IsoDate,
): Term | null {
  return (
    TERMS.find((term) => {
      const span = termSpan(year, term);
      return date >= span.startsOn && date <= span.endsOn;
    }) ?? null
  );
}

/** A trimmed note, required; never a future day. */
export function observation(
  input: { note: string; observedOn: IsoDate },
  today: IsoDate,
): { note: string; observedOn: IsoDate } {
  const note = input.note.trim();
  if (note === "")
    throw invalid("OBSERVATION_NOTE_REQUIRED", "Write what you observed.");
  if (note.length > MAX_OBSERVATION_LENGTH)
    throw invalid(
      "OBSERVATION_NOTE_TOO_LONG",
      `An Observation can be at most ${String(MAX_OBSERVATION_LENGTH)} characters.`,
    );
  if (input.observedOn > today)
    throw invalid(
      "OBSERVATION_DATE_IN_FUTURE",
      "An Observation cannot be on a day that is ahead.",
    );
  return { note, observedOn: input.observedOn };
}

/** A Development Domain's name: trimmed, 1–100 characters. */
export function domainName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw invalid(
      "DOMAIN_NAME_REQUIRED",
      "Enter the Development Domain's name.",
    );
  if (trimmed.length > 100)
    throw invalid(
      "DOMAIN_NAME_TOO_LONG",
      "A Development Domain's name can be at most 100 characters.",
    );
  return trimmed;
}

/** Each domain rated at most once in a report: 400 `RATING_REPEATED`. */
export function assertRatingsUnique(
  ratings: readonly { domainId: string }[],
): void {
  if (new Set(ratings.map((entry) => entry.domainId)).size !== ratings.length)
    throw invalid("RATING_REPEATED", "Rate each Development Domain once.");
}

/** Publishing needs every Domain in use rated: 409 `PROGRESS_REPORT_INCOMPLETE`. */
export function assertReportComplete(
  activeDomainIds: readonly string[],
  ratedDomainIds: readonly string[],
): void {
  const rated = new Set(ratedDomainIds);
  const missing = activeDomainIds.filter((id) => !rated.has(id));
  if (missing.length > 0)
    throw conflict(
      "PROGRESS_REPORT_INCOMPLETE",
      `Rate every Development Domain before publishing (${String(missing.length)} left).`,
      { missingDomainIds: missing },
    );
}
