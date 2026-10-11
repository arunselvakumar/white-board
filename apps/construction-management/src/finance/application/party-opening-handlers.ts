import type { MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { assertCalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  MAX_AMOUNT,
  type NewPartyEntry,
  type PartyType,
} from "../domain/ledger";
import {
  assertPartyOnPlace,
  paiseFrom,
  placeColumns,
  placeFromInput,
  type PartyPlace,
} from "../domain/party";
import {
  assertOnPlace,
  assertPlaceExists,
  auditable,
  loadParty,
  partyKey,
  partyNames,
} from "./party-common";
import type { PartyFinanceDeps, StoredOpening } from "./party-ports";

export const openingNotFound = () =>
  notFound("PARTY_OPENING_NOT_FOUND", "This opening balance was not found.");

export type SetOpeningInput = {
  partyType: PartyType;
  partyId: string;
  projectId?: string | null;
  storeId?: string | null;
  asOfDate: string;
  /** Paise, signed: + owed to the party, − an advance already with them. */
  amount: number;
  /** Required to change an existing opening. */
  expectedUpdatedAt?: Date | null;
};

export type OpeningView = StoredOpening & { partyName: string | null };

function entryOf(opening: StoredOpening): NewPartyEntry {
  return {
    partyType: opening.partyType,
    partyId: opening.partyId,
    ...placeColumns(opening.place),
    entryDate: opening.asOfDate,
    kind: "opening",
    amount: opening.amount,
    sourceType: "party_opening",
    sourceId: opening.id,
  };
}

/**
 * Opening balances per party per Project or Store (CM-705, ADR CM-0017
 * §7): one live opening each, posted as an `opening` party entry. A change
 * reverses the entry and posts the new one; removing it reverses. Only the
 * Financial Closing Date limits them (they are dated before the app).
 */
export class PartyOpeningHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: PartyFinanceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async find(workspaceId: string, id: string): Promise<StoredOpening> {
    const row = await this.deps.store.findOpening(
      this.deps.db,
      workspaceId,
      id,
    );
    if (row == null) throw openingNotFound();
    return row;
  }

  async get(workspaceId: string, id: string): Promise<OpeningView> {
    const row = await this.find(workspaceId, id);
    const names = await partyNames(this.deps, this.deps.db, workspaceId, [row]);
    return {
      ...row,
      partyName: names.get(partyKey(row.partyType, row.partyId)) ?? null,
    };
  }

  /** Sets (adds or changes) a party's opening on a place; returns its id. */
  async set(access: MemberAccess, input: SetOpeningInput): Promise<string> {
    const { db, store, ledgers } = this.deps;
    const workspaceId = access.workspaceId;
    const place = placeFromInput(input.partyType, input);
    await assertPlaceExists(this.deps, db, workspaceId, place);
    const party = await loadParty(
      this.deps,
      db,
      workspaceId,
      input.partyType,
      input.partyId,
    );
    assertPartyOnPlace(party, place);
    const asOfDate = assertCalendarDate(input.asOfDate, "AS_OF_DATE_INVALID");
    const amount = paiseFrom(input.amount, "amount", { allowNegative: true });
    if (amount > MAX_AMOUNT || -amount > MAX_AMOUNT)
      throw new DomainError(
        "AMOUNT_TOO_LARGE",
        "One amount is at most ₹100 crore.",
        { details: { field: "amount" } },
      );
    const check = await this.deps.backdated(access);
    check.closing(asOfDate);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      const existing = await store.lockOpeningOf(tx, workspaceId, party, place);
      if (existing == null) {
        assertOnPlace(access, "create", place);
        const row: StoredOpening = {
          id: newId(),
          workspaceId,
          partyType: party.type,
          partyId: party.id,
          place,
          asOfDate,
          amount,
          createdAt: at,
          updatedAt: at,
        };
        await store.insertOpening(tx, { ...row, by: access.userId });
        await ledgers.party.post(tx, workspaceId, access.userId, [
          entryOf(row),
        ]);
        await recordAudit(tx, {
          workspaceId,
          actorUserId: access.userId,
          action: "party_opening.set",
          entityType: "party_opening",
          entityId: row.id,
          after: auditable({ ...row }),
          occurredAt: at,
        });
        return row.id;
      }
      assertOnPlace(access, "update", place);
      if (input.expectedUpdatedAt == null)
        throw conflict(
          "PARTY_OPENING_EXISTS",
          "This party already has an opening balance here. Reload and change it.",
          { id: existing.id, updatedAt: existing.updatedAt.toISOString() },
        );
      if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw conflict(
          "PARTY_OPENING_CHANGED",
          "Someone changed this opening balance. Reload it and try again.",
          { updatedAt: existing.updatedAt.toISOString() },
        );
      check.closing(existing.asOfDate);
      const next = { ...existing, asOfDate, amount, updatedAt: at };
      await store.updateOpening(tx, existing.id, {
        asOfDate,
        amount,
        by: access.userId,
        at,
      });
      await ledgers.party.reverseSource(
        tx,
        workspaceId,
        access.userId,
        "party_opening",
        existing.id,
      );
      await ledgers.party.post(tx, workspaceId, access.userId, [entryOf(next)]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "party_opening.changed",
        entityType: "party_opening",
        entityId: existing.id,
        before: auditable({ ...existing }),
        after: auditable({ ...next }),
        occurredAt: at,
      });
      return existing.id;
    });
  }

  async remove(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const { db, store, ledgers } = this.deps;
    const workspaceId = access.workspaceId;
    const current = await this.find(workspaceId, id);
    assertOnPlace(access, "delete", current.place);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lockOpening(tx, workspaceId, id);
      if (locked == null) throw openingNotFound();
      if (locked.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw conflict(
          "PARTY_OPENING_CHANGED",
          "Someone changed this opening balance. Reload it and try again.",
          { updatedAt: locked.updatedAt.toISOString() },
        );
      check.closing(locked.asOfDate);
      await ledgers.party.reverseSource(
        tx,
        workspaceId,
        access.userId,
        "party_opening",
        id,
      );
      await store.tombstoneOpening(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "party_opening.removed",
        entityType: "party_opening",
        entityId: id,
        before: auditable({ ...locked }),
        occurredAt: at,
      });
    });
  }

  /** The openings of one party type on a place, with names. */
  async list(
    workspaceId: string,
    partyType: PartyType,
    place: PartyPlace,
  ): Promise<OpeningView[]> {
    const rows = await this.deps.store.openingsOn(
      this.deps.db,
      workspaceId,
      partyType,
      place,
    );
    const names = await partyNames(this.deps, this.deps.db, workspaceId, rows);
    return rows
      .map((row) => ({
        ...row,
        partyName: names.get(partyKey(row.partyType, row.partyId)) ?? null,
      }))
      .sort((a, b) => (a.partyName ?? "").localeCompare(b.partyName ?? ""));
  }
}
