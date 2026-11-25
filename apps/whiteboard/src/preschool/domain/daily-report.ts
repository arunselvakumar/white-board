import { isClockTime } from "./attendance";
import { invalid } from "./errors";

export const MEALS = ["breakfast", "snack", "lunch"] as const;
export type Meal = (typeof MEALS)[number];
export const ATE = ["all", "some", "none"] as const;
export type Ate = (typeof ATE)[number];
export const TOILET_KINDS = [
  "diaper_wet",
  "diaper_soiled",
  "potty",
  "toilet",
] as const;
export type ToiletKind = (typeof TOILET_KINDS)[number];
export const MOODS = ["happy", "calm", "tired", "fussy", "unwell"] as const;
export type Mood = (typeof MOODS)[number];
export type DailyReportStatus = "draft" | "published";

export const MAX_TOILET_ENTRIES = 12;
export const MAX_ACTIVITIES = 10;
export const MAX_ACTIVITY_LENGTH = 120;
export const MAX_NOTE_LENGTH = 2000;
export const MAX_PHOTOS = 6;

export type MealEntry = { meal: Meal; menu: string | null; ate: Ate };
export type ToiletEntry = { time: string; kind: ToiletKind };

/** What a Teacher writes about one Child's day. */
export type DailyReportContent = {
  meals: MealEntry[];
  napFrom: string | null;
  napTo: string | null;
  toilet: ToiletEntry[];
  mood: Mood | null;
  activities: string[];
  note: string | null;
  photos: string[];
};

export const EMPTY_DAILY_REPORT: DailyReportContent = {
  meals: [],
  napFrom: null,
  napTo: null,
  toilet: [],
  mood: null,
  activities: [],
  note: null,
  photos: [],
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function byMealOrder(a: MealEntry, b: MealEntry): number {
  return MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal);
}

/**
 * Checks and tidies a Daily Report: each meal once (in day order), a nap
 * with both ends and ending after it starts, at most 12 toilet entries in
 * time order, at most 10 activities of 120 characters, a note of 2000, and
 * at most 6 https photo links.
 */
export function dailyReportContent(input: {
  meals?: readonly { meal: Meal; menu?: string | null; ate: Ate }[];
  napFrom?: string | null;
  napTo?: string | null;
  toilet?: readonly ToiletEntry[];
  mood?: Mood | null;
  activities?: readonly string[];
  note?: string | null;
  photos?: readonly string[];
}): DailyReportContent {
  const meals = (input.meals ?? []).map((entry) => ({
    meal: entry.meal,
    menu: text(entry.menu),
    ate: entry.ate,
  }));
  if (new Set(meals.map((entry) => entry.meal)).size !== meals.length)
    throw invalid("MEAL_REPEATED", "Each meal can be recorded once.");

  const napFrom = text(input.napFrom);
  const napTo = text(input.napTo);
  if ((napFrom == null) !== (napTo == null))
    throw invalid("NAP_INCOMPLETE", "Enter when the nap started and ended.");
  if (napFrom != null && napTo != null) {
    if (!isClockTime(napFrom) || !isClockTime(napTo))
      throw invalid("TIME_INVALID", "Enter the nap times as HH:mm.");
    if (napTo <= napFrom)
      throw invalid("NAP_ORDER", "The nap must end after it starts.");
  }

  const toilet = [...(input.toilet ?? [])];
  if (toilet.length > MAX_TOILET_ENTRIES)
    throw invalid(
      "TOO_MANY_TOILET_ENTRIES",
      `Record at most ${String(MAX_TOILET_ENTRIES)} toilet entries.`,
    );
  if (toilet.some((entry) => !isClockTime(entry.time)))
    throw invalid("TIME_INVALID", "Enter toilet times as HH:mm.");
  toilet.sort((a, b) => a.time.localeCompare(b.time));

  const activities = (input.activities ?? [])
    .map((activity) => activity.trim())
    .filter((activity) => activity !== "");
  if (activities.length > MAX_ACTIVITIES)
    throw invalid(
      "TOO_MANY_ACTIVITIES",
      `List at most ${String(MAX_ACTIVITIES)} activities.`,
    );
  if (activities.some((activity) => activity.length > MAX_ACTIVITY_LENGTH))
    throw invalid(
      "ACTIVITY_TOO_LONG",
      `An activity can be at most ${String(MAX_ACTIVITY_LENGTH)} characters.`,
    );

  const note = text(input.note);
  if (note != null && note.length > MAX_NOTE_LENGTH)
    throw invalid(
      "NOTE_TOO_LONG",
      `The note can be at most ${String(MAX_NOTE_LENGTH)} characters.`,
    );

  const photos = [...(input.photos ?? [])];
  if (photos.length > MAX_PHOTOS)
    throw invalid(
      "TOO_MANY_PHOTOS",
      `Add at most ${String(MAX_PHOTOS)} photos.`,
    );
  if (photos.some((url) => !isHttpsUrl(url)))
    throw invalid("PHOTO_URL_INVALID", "Photos must be https links.");

  return {
    meals: meals.sort(byMealOrder),
    napFrom,
    napTo,
    toilet,
    mood: input.mood ?? null,
    activities,
    note,
    photos,
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The Classroom's shared items laid over one Child's report: each given
 * meal's menu (keeping an `ate` already chosen, else `all`) and the
 * activities not already listed, up to the limit. Nap, toilet, mood, note
 * and photos are left alone.
 */
export function applyClassroomItems(
  report: DailyReportContent,
  shared: {
    meals?: readonly { meal: Meal; menu?: string | null }[];
    activities?: readonly string[];
  },
): DailyReportContent {
  const meals = [...report.meals];
  for (const entry of shared.meals ?? []) {
    const menu = text(entry.menu);
    const index = meals.findIndex((meal) => meal.meal === entry.meal);
    const existing = meals[index];
    if (existing == null) meals.push({ meal: entry.meal, menu, ate: "all" });
    else meals[index] = { ...existing, menu };
  }
  const activities = [...report.activities];
  const listed = new Set(activities.map((activity) => activity.toLowerCase()));
  for (const raw of shared.activities ?? []) {
    const activity = raw.trim();
    if (activity === "" || listed.has(activity.toLowerCase())) continue;
    if (activities.length >= MAX_ACTIVITIES) break;
    activities.push(activity.slice(0, MAX_ACTIVITY_LENGTH));
    listed.add(activity.toLowerCase());
  }
  return { ...report, meals: meals.sort(byMealOrder), activities };
}
