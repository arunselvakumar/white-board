import { DomainError } from "./errors";

/** Added the first time a Workspace's Enquiry Sources are read (ADR-0032). */
export const DEFAULT_ENQUIRY_SOURCE_NAMES = [
  "Phone call",
  "Walk-in",
  "Referral",
  "Social media",
  "Website",
] as const;

export const ENQUIRY_SOURCE_NAME_MAX_LENGTH = 80;

export type EnquirySourceProps = {
  id: string;
  workspaceId: string;
  name: string;
  retiredAt: Date | null;
  retiredByUserId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
};

export function enquirySourceName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0 || name.length > ENQUIRY_SOURCE_NAME_MAX_LENGTH)
    throw new DomainError(
      "ENQUIRY_SOURCE_NAME_INVALID",
      `Source name must be 1 to ${String(ENQUIRY_SOURCE_NAME_MAX_LENGTH)} characters.`,
    );
  return name;
}

/** Key that makes active Source names unique, ignoring case. */
export function enquirySourceNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function enquirySourceNameInUse(): DomainError {
  return new DomainError(
    "ENQUIRY_SOURCE_NAME_IN_USE",
    "Another active Source already has this name.",
  );
}

/**
 * Where an Enquiry came from. Each Workspace keeps its own list. A retired
 * Source keeps its name on past Enquiries and isn't offered for new ones.
 */
export class EnquirySource {
  private constructor(private props: EnquirySourceProps) {}

  static add(input: {
    id: string;
    workspaceId: string;
    name: string;
    userId: string;
    now: Date;
  }): EnquirySource {
    return new EnquirySource({
      id: input.id,
      workspaceId: input.workspaceId,
      name: enquirySourceName(input.name),
      retiredAt: null,
      retiredByUserId: null,
      createdByUserId: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static rehydrate(props: EnquirySourceProps): EnquirySource {
    return new EnquirySource({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get retired(): boolean {
    return this.props.retiredAt != null;
  }

  rename(raw: string, now: Date): void {
    this.props = {
      ...this.props,
      name: enquirySourceName(raw),
      updatedAt: now,
    };
  }

  retire(input: { userId: string; now: Date }): void {
    if (this.retired)
      throw new DomainError(
        "ENQUIRY_SOURCE_ALREADY_RETIRED",
        "This Source is already retired.",
      );
    this.props = {
      ...this.props,
      retiredAt: input.now,
      retiredByUserId: input.userId,
      updatedAt: input.now,
    };
  }

  restore(now: Date): void {
    if (!this.retired)
      throw new DomainError(
        "ENQUIRY_SOURCE_NOT_RETIRED",
        "This Source isn't retired.",
      );
    this.props = {
      ...this.props,
      retiredAt: null,
      retiredByUserId: null,
      updatedAt: now,
    };
  }

  /** New and edited Enquiries can only choose an active Source. */
  assertSelectable(): void {
    if (this.retired)
      throw new DomainError(
        "ENQUIRY_SOURCE_RETIRED",
        "This Source is retired. Choose another Source.",
      );
  }

  toProps(): EnquirySourceProps {
    return { ...this.props };
  }
}
