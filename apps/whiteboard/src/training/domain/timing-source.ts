import { DomainError } from "./errors";

export const TIMING_SOURCES = ["batch", "student"] as const;

export type TimingSourceValue = (typeof TIMING_SOURCES)[number];

export class TimingSource {
  private constructor(readonly value: TimingSourceValue) {}

  static create(raw: string): TimingSource {
    if (!TIMING_SOURCES.includes(raw as TimingSourceValue)) {
      throw new DomainError(
        "TIMING_SOURCE_INVALID",
        "Timing source must be batch or student.",
      );
    }
    return new TimingSource(raw as TimingSourceValue);
  }

  get inheritsBatch(): boolean {
    return this.value === "batch";
  }
}
