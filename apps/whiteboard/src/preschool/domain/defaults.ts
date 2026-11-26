// What a new Preschool Workspace starts with. The Owner can rename, add to,
// and archive every one of these.

export const DEFAULT_ACADEMIC_YEAR_START_MONTH = 4;

export const DEFAULT_PROGRAMMES: readonly {
  name: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  isDaycare: boolean;
}[] = [
  { name: "Playgroup", minAgeMonths: 18, maxAgeMonths: 35, isDaycare: false },
  {
    name: "Nursery (Pre-KG)",
    minAgeMonths: 36,
    maxAgeMonths: 47,
    isDaycare: false,
  },
  { name: "LKG", minAgeMonths: 48, maxAgeMonths: 59, isDaycare: false },
  { name: "UKG", minAgeMonths: 60, maxAgeMonths: 71, isDaycare: false },
  { name: "Daycare", minAgeMonths: null, maxAgeMonths: null, isDaycare: true },
];

export const DEFAULT_FEE_HEADS: readonly {
  name: string;
  kind: "one_time" | "recurring";
  royaltyBearing: boolean;
  refundable: boolean;
}[] = [
  {
    name: "Admission fee",
    kind: "one_time",
    royaltyBearing: true,
    refundable: false,
  },
  {
    name: "Tuition",
    kind: "recurring",
    royaltyBearing: true,
    refundable: false,
  },
  {
    name: "Kit & books",
    kind: "one_time",
    royaltyBearing: false,
    refundable: false,
  },
  {
    name: "Uniform",
    kind: "one_time",
    royaltyBearing: false,
    refundable: false,
  },
  {
    name: "Activity fee",
    kind: "recurring",
    royaltyBearing: false,
    refundable: false,
  },
  {
    name: "Daycare",
    kind: "recurring",
    royaltyBearing: false,
    refundable: false,
  },
  {
    name: "Transport",
    kind: "recurring",
    royaltyBearing: false,
    refundable: false,
  },
  {
    name: "Security deposit",
    kind: "one_time",
    royaltyBearing: false,
    refundable: true,
  },
];

/** NEP 2020 / NCF Foundational Stage (2022): five domains and learning habits. */
export const DEFAULT_DEVELOPMENT_DOMAINS: readonly {
  name: string;
  description: string;
}[] = [
  {
    name: "Physical development",
    description: "Gross and fine motor skills, health, hygiene and safety.",
  },
  {
    name: "Socio-emotional and ethical development",
    description: "Emotions, friendships, sharing, empathy and care for others.",
  },
  {
    name: "Cognitive development",
    description: "Observation, sorting, patterns, numbers and problem solving.",
  },
  {
    name: "Language and literacy development",
    description:
      "Listening, speaking, early reading and writing in the home language and English.",
  },
  {
    name: "Aesthetic and cultural development",
    description: "Art, music, movement, drama and local culture.",
  },
  {
    name: "Positive learning habits",
    description: "Attention, curiosity, persistence and following routines.",
  },
];

/**
 * A Centre code from its name: the initials of up to four words, or the first
 * letters of a single word. 2–6 upper-case letters or digits.
 */
export function centreCodeFromName(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const code =
    words.length >= 2
      ? words
          .slice(0, 4)
          .map((word) => word[0])
          .join("")
      : (words[0] ?? "").slice(0, 4);
  return code.length >= 2 ? code : `${code}C1`.slice(0, 6);
}
