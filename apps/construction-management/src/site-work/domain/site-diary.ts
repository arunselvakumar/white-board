import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  optionalDecimal,
  optionalLine,
  pastOrToday,
  requiredLine,
} from "./site-record-text";

/**
 * The Site Diary (ADR CM-0016 §13, CM-607): one per Project per date, with
 * the weather in the morning and the afternoon, rainfall, site condition,
 * visitors, instructions, notes and photos.
 */

export const WEATHERS = [
  "sunny",
  "cloudy",
  "light_rain",
  "heavy_rain",
  "windy",
  "foggy",
  "very_hot",
] as const;
export type Weather = (typeof WEATHERS)[number];

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: "Sunny",
  cloudy: "Cloudy",
  light_rain: "Light rain",
  heavy_rain: "Heavy rain",
  windy: "Windy",
  foggy: "Foggy",
  very_hot: "Very hot",
};

export function isWeather(value: string): value is Weather {
  return (WEATHERS as readonly string[]).includes(value);
}

export const SITE_DIARY_LIMITS = {
  siteCondition: 500,
  notes: 2000,
  visitors: 50,
  instructions: 50,
  visitorName: 120,
  organisation: 120,
  purpose: 200,
  person: 120,
  instruction: 1000,
  actionTaken: 1000,
  /** Rainfall in mm: up to 9999.9 (`decimal(6,1)`). */
  rainfallDigits: 4,
} as const;

/** `HH:MM`, 00:00–23:59. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SiteDiaryVisitorInput = {
  name: string;
  organisation?: string | null;
  purpose?: string | null;
  timeIn?: string | null;
  timeOut?: string | null;
};

export type SiteDiaryInstructionInput = {
  givenBy: string;
  givenTo?: string | null;
  instruction: string;
  actionTaken?: string | null;
};

export type SiteDiaryInput = {
  diaryDate: string;
  weatherMorning?: Weather | null;
  weatherAfternoon?: Weather | null;
  /** mm, ≥ 0, one decimal. */
  rainfallMm?: string | number | null;
  siteCondition?: string | null;
  notes?: string | null;
  visitors?: readonly SiteDiaryVisitorInput[];
  instructions?: readonly SiteDiaryInstructionInput[];
};

export type SiteDiaryVisitor = {
  name: string;
  organisation: string | null;
  purpose: string | null;
  timeIn: string | null;
  timeOut: string | null;
};

export type SiteDiaryInstruction = {
  givenBy: string;
  givenTo: string | null;
  instruction: string;
  actionTaken: string | null;
};

/** What a save writes besides the bookkeeping columns. */
export type SiteDiaryContent = {
  diaryDate: CalendarDate;
  weatherMorning: Weather | null;
  weatherAfternoon: Weather | null;
  /** Decimal string, one decimal at most ("12.5"), or null. */
  rainfallMm: string | null;
  siteCondition: string | null;
  notes: string | null;
  visitors: SiteDiaryVisitor[];
  instructions: SiteDiaryInstruction[];
};

function time(raw: string | null | undefined, field: string): string | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  if (!TIME_PATTERN.test(text))
    throw new DomainError("SITE_DIARY_TIME_INVALID", "Enter a time as HH:MM.", {
      details: { field },
    });
  return text;
}

function weather(
  value: string | null | undefined,
  field: string,
): Weather | null {
  if (value == null || value === "") return null;
  if (!isWeather(value))
    throw new DomainError("SITE_DIARY_WEATHER_INVALID", "Choose the weather.", {
      details: { field },
    });
  return value;
}

/** Visitor rows: name required; times as `HH:MM`, time out not before time in. */
export function siteDiaryVisitors(
  rows: readonly SiteDiaryVisitorInput[],
): SiteDiaryVisitor[] {
  if (rows.length > SITE_DIARY_LIMITS.visitors)
    throw new DomainError(
      "SITE_DIARY_TOO_MANY_VISITORS",
      `A diary holds at most ${String(SITE_DIARY_LIMITS.visitors)} visitors.`,
      { details: { field: "visitors" } },
    );
  return rows.map((row, index) => {
    const at = (name: string) => `visitors.${String(index)}.${name}`;
    const timeIn = time(row.timeIn, at("timeIn"));
    const timeOut = time(row.timeOut, at("timeOut"));
    if (timeIn != null && timeOut != null && timeOut < timeIn)
      throw new DomainError(
        "SITE_DIARY_TIME_OUT_BEFORE_IN",
        "Time out cannot be before time in.",
        { details: { field: at("timeOut") } },
      );
    return {
      name: requiredLine(
        row.name,
        "SITE_DIARY_VISITOR_NAME_REQUIRED",
        "Enter the visitor's name.",
        at("name"),
        SITE_DIARY_LIMITS.visitorName,
      ),
      organisation: optionalLine(
        row.organisation,
        at("organisation"),
        SITE_DIARY_LIMITS.organisation,
      ),
      purpose: optionalLine(
        row.purpose,
        at("purpose"),
        SITE_DIARY_LIMITS.purpose,
      ),
      timeIn,
      timeOut,
    };
  });
}

/** Instruction rows: given by and the instruction are required. */
export function siteDiaryInstructions(
  rows: readonly SiteDiaryInstructionInput[],
): SiteDiaryInstruction[] {
  if (rows.length > SITE_DIARY_LIMITS.instructions)
    throw new DomainError(
      "SITE_DIARY_TOO_MANY_INSTRUCTIONS",
      `A diary holds at most ${String(SITE_DIARY_LIMITS.instructions)} instructions.`,
      { details: { field: "instructions" } },
    );
  return rows.map((row, index) => {
    const at = (name: string) => `instructions.${String(index)}.${name}`;
    return {
      givenBy: requiredLine(
        row.givenBy,
        "SITE_DIARY_GIVEN_BY_REQUIRED",
        "Enter who gave the instruction.",
        at("givenBy"),
        SITE_DIARY_LIMITS.person,
      ),
      givenTo: optionalLine(
        row.givenTo,
        at("givenTo"),
        SITE_DIARY_LIMITS.person,
      ),
      instruction: requiredLine(
        row.instruction,
        "SITE_DIARY_INSTRUCTION_REQUIRED",
        "Write the instruction.",
        at("instruction"),
        SITE_DIARY_LIMITS.instruction,
      ),
      actionTaken: optionalLine(
        row.actionTaken,
        at("actionTaken"),
        SITE_DIARY_LIMITS.actionTaken,
      ),
    };
  });
}

/** Checks and normalises a diary; the date may not be after `today`. */
export function siteDiaryContent(
  input: SiteDiaryInput,
  today: CalendarDate,
): SiteDiaryContent {
  return {
    diaryDate: pastOrToday(
      input.diaryDate,
      {
        invalid: "SITE_DIARY_DATE_INVALID",
        future: "SITE_DIARY_DATE_IN_FUTURE",
      },
      "diaryDate",
      today,
    ),
    weatherMorning: weather(input.weatherMorning, "weatherMorning"),
    weatherAfternoon: weather(input.weatherAfternoon, "weatherAfternoon"),
    rainfallMm: optionalDecimal(input.rainfallMm, {
      code: "SITE_DIARY_RAINFALL_INVALID",
      field: "rainfallMm",
      scale: 1,
      digits: SITE_DIARY_LIMITS.rainfallDigits,
    }),
    siteCondition: optionalLine(
      input.siteCondition,
      "siteCondition",
      SITE_DIARY_LIMITS.siteCondition,
    ),
    notes: optionalLine(input.notes, "notes", SITE_DIARY_LIMITS.notes),
    visitors: siteDiaryVisitors(input.visitors ?? []),
    instructions: siteDiaryInstructions(input.instructions ?? []),
  };
}
