import { DomainError } from "./errors";

export type WeeklySlot = {
  daysOfWeek: readonly number[];
  startTime: string;
  endTime: string;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class WeeklyTimings {
  private constructor(readonly slots: readonly WeeklySlot[]) {}

  static create(raw: unknown): WeeklyTimings {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new DomainError(
        "TIMINGS_REQUIRED",
        "Batch Timings need at least one weekly slot.",
      );
    }
    const slots = raw.map(parseSlot);
    return new WeeklyTimings(slots);
  }

  toJson(): WeeklySlot[] {
    return this.slots.map((slot) => ({
      daysOfWeek: [...slot.daysOfWeek],
      startTime: slot.startTime,
      endTime: slot.endTime,
    }));
  }
}

function parseSlot(raw: unknown): WeeklySlot {
  if (typeof raw !== "object" || raw == null) {
    throw new DomainError("TIMINGS_INVALID", "Each Timing slot is invalid.");
  }
  const record = raw as {
    daysOfWeek?: unknown;
    startTime?: unknown;
    endTime?: unknown;
  };
  if (!Array.isArray(record.daysOfWeek) || record.daysOfWeek.length === 0) {
    throw new DomainError(
      "TIMINGS_INVALID",
      "Each Timing slot needs days of week.",
    );
  }
  const daysOfWeek = record.daysOfWeek.map((day) => {
    if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) {
      throw new DomainError(
        "TIMINGS_INVALID",
        "Days of week must be 0 (Sunday) through 6 (Saturday).",
      );
    }
    return day;
  });
  if (typeof record.startTime !== "string" || !TIME_RE.test(record.startTime)) {
    throw new DomainError("TIMINGS_INVALID", "Start time must be HH:mm.");
  }
  if (typeof record.endTime !== "string" || !TIME_RE.test(record.endTime)) {
    throw new DomainError("TIMINGS_INVALID", "End time must be HH:mm.");
  }
  if (record.startTime >= record.endTime) {
    throw new DomainError(
      "TIMINGS_INVALID",
      "Start time must be before end time.",
    );
  }
  return {
    daysOfWeek,
    startTime: record.startTime,
    endTime: record.endTime,
  };
}
