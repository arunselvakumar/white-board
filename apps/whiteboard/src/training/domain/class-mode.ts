import { DomainError } from "./errors";

export const CLASS_MODES = ["offline", "online", "hybrid"] as const;

export type ClassModeValue = (typeof CLASS_MODES)[number];

export class ClassMode {
  private constructor(readonly value: ClassModeValue) {}

  static create(raw: string): ClassMode {
    if (!CLASS_MODES.includes(raw as ClassModeValue)) {
      throw new DomainError(
        "CLASS_MODE_INVALID",
        "Class Mode must be Offline, Online, or Hybrid.",
      );
    }
    return new ClassMode(raw as ClassModeValue);
  }
}
