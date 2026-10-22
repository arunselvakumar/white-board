import { can, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";

import type { AccountActor, AccountFacts } from "../domain/accounts";
import type { CounterpartyKind, PaymentMode } from "../domain/ledger";
import type { Tx } from "./account-handlers";
import type { FinanceDirectory, NamedFacts } from "./ports";

/**
 * What Transactions and transfers share (CM-702, ADR CM-0017 §4, §5): the
 * menu, where a document sits (a Project, a Store or the Company), the
 * Paid To / Received From label, the duplicate-reference rule and the
 * texts' limits.
 */

export const TRANSACTIONS_MENU = "finance.transactions" as const;

export const TRANSACTION_LIMITS = {
  description: 1000,
  reference: 60,
  counterpartyName: 200,
} as const;

/**
 * A Transaction or transfer on a Project is checked against the menu on
 * that Project. One on a Store, or Company-level (neither), needs the flag
 * on the menu with no Project scope; the company-wide list stays with the
 * Owner (Central Payment).
 */
export function scopeOf(place: { projectId: string | null }): {
  projectId?: string;
} {
  return place.projectId == null ? {} : { projectId: place.projectId };
}

/** Owner, or Petty Cash View all: may move money through any petty cash. */
export function accountActor(access: MemberAccess): AccountActor {
  return {
    userId: access.userId,
    anyPettyCash: can(access, "finance.petty_cash", "view_all"),
  };
}

export type CounterpartyInput = {
  kind: CounterpartyKind | null;
  id: string | null;
  name: string;
} | null;

export type CounterpartyLabel = {
  counterpartyKind: CounterpartyKind | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
};

export const NO_COUNTERPARTY: CounterpartyLabel = {
  counterpartyKind: null,
  counterpartyId: null,
  counterpartyName: null,
};

/** A live Payment Category's name and whether it is disabled. */
export type CategoryFacts = { id: string; name: string; disabled: boolean };

/** The document a reference was already used on. */
export type ReferenceUse = {
  type: "transaction" | "account_transfer" | "party_payment";
  id: string;
  number: string;
  date: CalendarDate;
};

/** What the commands read beyond their own rows. */
export type TransactionLookups = {
  paymentCategories(
    db: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, CategoryFacts>>;
  otherParties(
    db: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, NamedFacts>>;
  /**
   * A live, non-rejected Transaction, transfer or party payment of the
   * account whose cheque number or reference is `reference` (ignoring
   * case and spaces), other than `except`.
   */
  referenceUse(
    db: Tx,
    workspaceId: string,
    accountId: string,
    reference: string,
    except: { type: ReferenceUse["type"]; id: string } | null,
  ): Promise<ReferenceUse | null>;
  /** Account names by id, deleted ones too (for old documents). */
  accounts(
    db: Tx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { name: string; kind: string }>>;
};

export function optionalText(
  raw: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const text = raw?.trim() ?? "";
  if (text.length > max)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      { details: { field } },
    );
  return text === "" ? null : text;
}

/**
 * Paid To / Received From (ADR CM-0017 §5): nothing, a typed name, or a
 * party of a kind that exists in the Company. The stored name is the
 * party's name when it was picked. An unchanged pick is kept even if the
 * party has since left.
 */
export async function resolveCounterparty(
  db: Tx,
  directory: Pick<
    FinanceDirectory,
    | "contractors"
    | "suppliers"
    | "labours"
    | "vendors"
    | "teamMembers"
    | "clients"
  >,
  lookups: Pick<TransactionLookups, "otherParties">,
  workspaceId: string,
  input: CounterpartyInput | undefined,
  current: CounterpartyLabel | null,
): Promise<CounterpartyLabel> {
  if (input == null) return NO_COUNTERPARTY;
  if (input.kind == null) {
    const name = optionalText(
      input.name,
      TRANSACTION_LIMITS.counterpartyName,
      "counterparty",
    );
    return name == null
      ? NO_COUNTERPARTY
      : {
          counterpartyKind: null,
          counterpartyId: null,
          counterpartyName: name,
        };
  }
  const id = input.id ?? "";
  if (id === "")
    throw new DomainError(
      "COUNTERPARTY_REQUIRED",
      "Choose who was paid or who paid.",
      { details: { field: "counterparty" } },
    );
  if (current?.counterpartyKind === input.kind && current.counterpartyId === id)
    return current;
  let found: { name: string } | undefined;
  switch (input.kind) {
    case "contractor":
      found = (await directory.contractors(db, workspaceId, [id])).get(id);
      break;
    case "supplier":
      found = (await directory.suppliers(db, workspaceId, [id])).get(id);
      break;
    case "labour":
      found = (await directory.labours(db, workspaceId, [id])).get(id);
      break;
    case "vendor":
      found = (await directory.vendors(db, workspaceId, [id])).get(id);
      break;
    case "team_member": {
      const member = (await directory.teamMembers(db, workspaceId, [id])).get(
        id,
      );
      found = member?.active === true ? member : undefined;
      break;
    }
    case "other_party":
      found = (await lookups.otherParties(db, workspaceId, [id])).get(id);
      break;
    case "client":
      found = (await directory.clients(db, workspaceId, [id])).get(id);
      break;
  }
  if (found == null)
    throw new DomainError(
      "COUNTERPARTY_NOT_FOUND",
      "That party was not found. Choose another or type a name.",
      { details: { field: "counterparty" } },
    );
  return {
    counterpartyKind: input.kind,
    counterpartyId: id,
    counterpartyName: found.name,
  };
}

/** A live, enabled category; an unchanged disabled one is kept. */
export async function resolveCategory(
  db: Tx,
  lookups: Pick<TransactionLookups, "paymentCategories">,
  workspaceId: string,
  id: string | null | undefined,
  current: string | null,
): Promise<string | null> {
  if (id == null || id === "") return null;
  if (id === current) return id;
  const category = (await lookups.paymentCategories(db, workspaceId, [id])).get(
    id,
  );
  if (category == null || category.disabled)
    throw new DomainError(
      "PAYMENT_CATEGORY_NOT_FOUND",
      "Choose a Payment Category that is in use.",
      { details: { field: "paymentCategoryId" } },
    );
  return id;
}

/** The cheque number for a cheque, else the transaction reference. */
export function referenceOf(input: {
  mode: PaymentMode;
  chequeNumber?: string | null;
  reference?: string | null;
}): string | null {
  const raw = input.mode === "cheque" ? input.chequeNumber : input.reference;
  const text = raw?.trim() ?? "";
  return text === "" ? null : text;
}

const DOCUMENT_LABELS: Record<ReferenceUse["type"], string> = {
  transaction: "Transaction",
  account_transfer: "Transfer",
  party_payment: "Payment",
};

/**
 * 409 `DUPLICATE_REFERENCE` (ADR CM-0017 §5) when the reference is already
 * on another live document of the account, unless the user confirmed it
 * ("Save anyway").
 */
export async function assertReferenceFree(
  db: Tx,
  lookups: Pick<TransactionLookups, "referenceUse">,
  workspaceId: string,
  accountId: string,
  reference: string | null,
  except: { type: ReferenceUse["type"]; id: string } | null,
  confirmed: boolean,
): Promise<void> {
  if (reference == null || confirmed) return;
  const used = await lookups.referenceUse(
    db,
    workspaceId,
    accountId,
    reference,
    except,
  );
  if (used != null)
    throw conflict(
      "DUPLICATE_REFERENCE",
      `${reference} is already on ${DOCUMENT_LABELS[used.type]} ${used.number} of this account. Save anyway if it is right.`,
      { field: "reference", document: used },
    );
}

/** Team Member names of users (created by, decided by), by user id. */
export async function userNames(
  db: Tx,
  directory: Pick<FinanceDirectory, "memberOfUser">,
  workspaceId: string,
  userIds: Iterable<string | null>,
): Promise<Map<string, string>> {
  const ids = [
    ...new Set([...userIds].filter((id): id is string => id != null)),
  ];
  const members = await Promise.all(
    ids.map((id) => directory.memberOfUser(db, workspaceId, id)),
  );
  return new Map(
    ids.flatMap((id, index) => {
      const member = members[index];
      return member == null ? [] : [[id, member.name] as const];
    }),
  );
}

/** The account a command names, locked `FOR SHARE` (`lockedAccountFacts`). */
export type AccountFactsPort = (
  tx: Tx,
  workspaceId: string,
  accountId: string,
) => Promise<AccountFacts | null>;
