import { DomainError } from "@/src/shared-kernel/domain-error";

import { masterNotFound } from "./master-kind";

export const TERMS_TITLE_MAX = 120;
export const TERMS_BODY_MAX = 5000;

export type TermsConditionProps = {
  id: string;
  workspaceId: string;
  title: string;
  body: string;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  deletedAt: Date | null;
  deletedBy: string | null;
};

export type TermsConditionSnapshot = {
  title: string;
  body: string;
  disabled: boolean;
};

/** Title (spaces tidied, ≤ 120) and body (≤ 5,000, line breaks kept). */
export function termsText(input: { title: string; body: string }): {
  title: string;
  body: string;
} {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title === "")
    throw new DomainError(
      "TERMS_CONDITION_TITLE_REQUIRED",
      "Enter the title of the Terms & Conditions.",
    );
  if (title.length > TERMS_TITLE_MAX)
    throw new DomainError(
      "TERMS_CONDITION_TITLE_TOO_LONG",
      `Title must be at most ${String(TERMS_TITLE_MAX)} characters.`,
    );
  const body = input.body.trim();
  if (body === "")
    throw new DomainError(
      "TERMS_CONDITION_BODY_REQUIRED",
      "Enter the terms themselves.",
    );
  if (body.length > TERMS_BODY_MAX)
    throw new DomainError(
      "TERMS_CONDITION_BODY_TOO_LONG",
      `The terms must be at most ${String(TERMS_BODY_MAX)} characters.`,
    );
  return { title, body };
}

/**
 * Reusable Terms & Conditions picked on Purchase Orders, which copy the
 * text at save (ADR CM-0015 §8): editing or deleting one never changes a
 * PO already raised, so a row is never "in use".
 */
export class TermsCondition {
  private constructor(private props: TermsConditionProps) {}

  static create(input: {
    id: string;
    workspaceId: string;
    title: string;
    body: string;
    by: string;
    now: Date;
  }): TermsCondition {
    return new TermsCondition({
      id: input.id,
      workspaceId: input.workspaceId,
      ...termsText(input),
      disabledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
      createdBy: input.by,
      updatedBy: input.by,
      deletedAt: null,
      deletedBy: null,
    });
  }

  static reconstitute(props: TermsConditionProps): TermsCondition {
    return new TermsCondition(props);
  }

  get id(): string {
    return this.props.id;
  }
  get workspaceId(): string {
    return this.props.workspaceId;
  }
  get title(): string {
    return this.props.title;
  }
  get body(): string {
    return this.props.body;
  }
  get disabled(): boolean {
    return this.props.disabledAt != null;
  }
  get disabledAt(): Date | null {
    return this.props.disabledAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get updatedBy(): string {
    return this.props.updatedBy;
  }
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }
  get deletedBy(): string | null {
    return this.props.deletedBy;
  }

  snapshot(): TermsConditionSnapshot {
    return {
      title: this.props.title,
      body: this.props.body,
      disabled: this.disabled,
    };
  }

  private assertLive(): void {
    if (this.props.deletedAt != null) throw masterNotFound("terms_condition");
  }

  update(input: { title: string; body: string }, by: string, now: Date): void {
    this.assertLive();
    this.props = {
      ...this.props,
      ...termsText(input),
      updatedAt: now,
      updatedBy: by,
    };
  }

  setDisabled(disabled: boolean, by: string, now: Date): boolean {
    this.assertLive();
    if (this.disabled === disabled) return false;
    this.props = {
      ...this.props,
      disabledAt: disabled ? now : null,
      updatedAt: now,
      updatedBy: by,
    };
    return true;
  }

  delete(by: string, now: Date): void {
    this.assertLive();
    this.props = {
      ...this.props,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
      updatedBy: by,
    };
  }
}
