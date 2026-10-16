import type { MemberAccess } from "@/src/shared-kernel/access";
import {
  bulkIds,
  bulkRefused,
  requiredText,
  type BulkRefusal,
} from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import { newId } from "@/src/shared-kernel/ids";

import { invoiceProgress, writeOffEntry } from "../domain/invoice";
import type { PartyType } from "../domain/ledger";
import { PARTY_TEXT_LIMITS } from "../domain/party";
import { invoiceNotFound, type InvoiceView } from "./invoice-handlers";
import {
  assertOnPlace,
  canOnPlace,
  partyKey,
  partyNames,
  placeKey,
  placeNames,
} from "./party-common";
import type {
  FinanceTx,
  PartyBackdated,
  PartyFinanceDeps,
  StoredInvoice,
  StoredSettlement,
} from "./party-ports";

export const settlementNotFound = () =>
  notFound("SETTLEMENT_NOT_FOUND", "This settlement was not found.");

export type SettlementView = StoredSettlement & {
  raisedByName: string | null;
  decidedByName: string | null;
  invoice: Pick<
    InvoiceView,
    | "id"
    | "partyType"
    | "partyId"
    | "partyName"
    | "place"
    | "placeName"
    | "direction"
    | "invoiceNumber"
    | "invoiceDate"
    | "amount"
  > & { balance: bigint };
  actions: { approve: boolean; reject: boolean };
};

function reasonOf(raw: string | null | undefined, field: string): string {
  const text = requiredText(raw, "REASON_REQUIRED", field);
  if (text.length > PARTY_TEXT_LIMITS.reason)
    throw new DomainError("TEXT_TOO_LONG", "Use at most 500 characters.", {
      details: { field },
    });
  return text;
}

/**
 * **Settle Invoice** (CM-705, CM-708; ADR CM-0017 §7): a request to write
 * off what is left of an invoice, decided by a member with Approve /
 * Reject on Parties. Approval re-reads the balance, posts the write-off
 * and marks the invoice Settled; bulk decisions are all or none.
 */
export class SettlementHandlers {
  private readonly clock: () => Date;

  constructor(
    private readonly deps: PartyFinanceDeps,
    /**
     * `document.submitted` / `approved` / `rejected` after commit (CM-904,
     * documentType `invoice_settlement`; its number is the invoice's).
     */
    private readonly events: EventDispatcher,
  ) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private async dispatchApproval(
    decided: readonly {
      settlement: Pick<StoredSettlement, "id" | "workspaceId" | "createdBy">;
      invoice: Pick<StoredInvoice, "place" | "invoiceNumber">;
    }[],
    outcome: ApprovalOutcome,
    by: string,
    at: Date,
  ): Promise<void> {
    if (decided.length === 0) return;
    await this.events.dispatch(
      decided.map(({ settlement, invoice }) =>
        approvalEvent(
          {
            workspaceId: settlement.workspaceId,
            documentType: "invoice_settlement",
            documentId: settlement.id,
            projectId:
              invoice.place.kind === "project" ? invoice.place.id : null,
            number: invoice.invoiceNumber,
            createdBy: settlement.createdBy,
          },
          outcome,
          by,
          at,
        ),
      ),
    );
  }

  async find(workspaceId: string, id: string): Promise<StoredSettlement> {
    const row = await this.deps.store.findSettlement(
      this.deps.db,
      workspaceId,
      id,
    );
    if (row == null) throw settlementNotFound();
    return row;
  }

  /** The invoice of a settlement, for the route's access check. */
  async invoiceOf(workspaceId: string, id: string): Promise<StoredInvoice> {
    const settlement = await this.find(workspaceId, id);
    const invoice = await this.deps.store.findInvoice(
      this.deps.db,
      workspaceId,
      settlement.invoiceId,
    );
    if (invoice == null) throw invoiceNotFound();
    return invoice;
  }

  /** Raises a settlement of an invoice's balance; returns its id. */
  async raise(
    access: MemberAccess,
    invoiceId: string,
    rawReason: string,
  ): Promise<string> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const reason = reasonOf(rawReason, "reason");
    const invoice = await store.findInvoice(db, workspaceId, invoiceId);
    if (invoice == null) throw invoiceNotFound();
    assertOnPlace(access, "create", invoice.place);
    const id = newId();
    const at = this.clock();
    const today = await this.deps.today(workspaceId);
    await db.$transaction(async (tx) => {
      const [locked] = await store.lockInvoices(tx, workspaceId, [invoiceId]);
      if (locked == null) throw invoiceNotFound();
      if (locked.settledAt != null)
        throw conflict("INVOICE_SETTLED", "This invoice is already settled.");
      const pending = (await store.settlementsOfInvoices(tx, [invoiceId])).find(
        (row) => row.approvalStatus === "pending",
      );
      if (pending != null)
        throw conflict(
          "SETTLEMENT_PENDING",
          "A settlement of this invoice is already waiting for approval.",
          { settlementId: pending.id },
        );
      const balance = await this.balanceOf(tx, locked, today);
      if (balance <= 0n)
        throw conflict(
          "INVOICE_NO_BALANCE",
          "Nothing is left to settle on this invoice.",
        );
      await store.insertSettlement(tx, {
        id,
        workspaceId,
        invoiceId,
        amount: balance,
        reason,
        approvalStatus: "pending",
        decidedBy: null,
        decidedAt: null,
        rejectReason: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      });
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "settlement.raised",
        entityType: "settlement",
        entityId: id,
        after: { invoiceId, amount: Number(balance), reason },
        occurredAt: at,
      });
    });
    await this.dispatchApproval(
      [
        {
          settlement: { id, workspaceId, createdBy: access.userId },
          invoice,
        },
      ],
      { kind: "submitted" },
      access.userId,
      at,
    );
    return id;
  }

  private async balanceOf(
    tx: FinanceTx,
    invoice: StoredInvoice,
    today: string,
  ): Promise<bigint> {
    const figures = (
      await this.deps.store.invoiceFigures(tx, [invoice.id])
    ).get(invoice.id) ?? { allocated: 0n, writtenOff: 0n };
    return invoiceProgress({ ...invoice, ...figures }, today).balance;
  }

  /** One decision inside the caller's transaction. */
  private async decide(
    tx: FinanceTx,
    access: MemberAccess,
    settlement: StoredSettlement,
    decision: { approve: true } | { approve: false; reason: string },
    context: { check: PartyBackdated; today: string; at: Date },
  ): Promise<StoredInvoice> {
    const { store, ledgers } = this.deps;
    const workspaceId = access.workspaceId;
    if (settlement.approvalStatus !== "pending")
      throw conflict(
        "SETTLEMENT_NOT_PENDING",
        `This settlement is ${settlement.approvalStatus}, not pending.`,
      );
    const [invoice] = await store.lockInvoices(tx, workspaceId, [
      settlement.invoiceId,
    ]);
    if (invoice == null) throw invoiceNotFound();
    assertOnPlace(
      access,
      decision.approve ? "approve" : "reject",
      invoice.place,
    );
    context.check.closing(context.today);
    if (!decision.approve) {
      await store.decideSettlement(tx, settlement.id, {
        approvalStatus: "rejected",
        rejectReason: decision.reason,
        by: access.userId,
        at: context.at,
      });
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "settlement.rejected",
        entityType: "settlement",
        entityId: settlement.id,
        after: { reason: decision.reason },
        occurredAt: context.at,
      });
      return invoice;
    }
    if (invoice.settledAt != null)
      throw conflict("INVOICE_SETTLED", "This invoice is already settled.");
    const balance = await this.balanceOf(tx, invoice, context.today);
    if (balance <= 0n)
      throw conflict(
        "INVOICE_NO_BALANCE",
        `Invoice ${invoice.invoiceNumber} has nothing left to settle.`,
      );
    await ledgers.party.post(tx, workspaceId, access.userId, [
      writeOffEntry({
        settlementId: settlement.id,
        invoice,
        balance,
        date: context.today,
      }),
    ]);
    await store.decideSettlement(tx, settlement.id, {
      approvalStatus: "approved",
      amount: balance,
      rejectReason: null,
      by: access.userId,
      at: context.at,
    });
    await store.updateInvoice(tx, invoice.id, {
      settledAt: context.at,
      updatedAt: context.at,
      updatedBy: access.userId,
    });
    await recordAudit(tx, {
      workspaceId,
      actorUserId: access.userId,
      action: "settlement.approved",
      entityType: "settlement",
      entityId: settlement.id,
      after: { invoiceId: invoice.id, writtenOff: Number(balance) },
      occurredAt: context.at,
    });
    return invoice;
  }

  private async run(
    access: MemberAccess,
    ids: readonly string[],
    decision: { approve: true } | { approve: false; reason: string },
    bulk: boolean,
  ): Promise<void> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const check = await this.deps.backdated(access);
    const today = await this.deps.today(workspaceId);
    const at = this.clock();
    const decided: { settlement: StoredSettlement; invoice: StoredInvoice }[] =
      [];
    await db.$transaction(async (tx) => {
      const locked = await store.lockSettlements(tx, workspaceId, ids);
      const byId = new Map(locked.map((row) => [row.id, row]));
      const refusals: BulkRefusal[] = [];
      for (const id of ids) {
        const settlement = byId.get(id);
        try {
          if (settlement == null) throw settlementNotFound();
          const invoice = await this.decide(tx, access, settlement, decision, {
            check,
            today,
            at,
          });
          decided.push({ settlement, invoice });
        } catch (error) {
          if (!bulk || !(error instanceof DomainError)) throw error;
          refusals.push({ id, code: error.code, message: error.message });
        }
      }
      if (refusals.length > 0) throw bulkRefused(refusals);
    });
    await this.dispatchApproval(
      decided,
      decision.approve
        ? { kind: "approved" }
        : { kind: "rejected", reason: decision.reason },
      access.userId,
      at,
    );
  }

  async approve(access: MemberAccess, id: string): Promise<void> {
    await this.run(access, [id], { approve: true }, false);
  }

  async reject(
    access: MemberAccess,
    id: string,
    reason: string,
  ): Promise<void> {
    await this.run(
      access,
      [id],
      { approve: false, reason: reasonOf(reason, "reason") },
      false,
    );
  }

  async bulkApprove(access: MemberAccess, ids: readonly string[]) {
    await this.run(access, bulkIds(ids), { approve: true }, true);
  }

  async bulkReject(
    access: MemberAccess,
    ids: readonly string[],
    reason: string,
  ) {
    await this.run(
      access,
      bulkIds(ids),
      { approve: false, reason: reasonOf(reason, "reason") },
      true,
    );
  }

  /**
   * Settlements the member may see: on a Project when given, otherwise on
   * every Project they read Parties on (the Owner also sees Stores).
   */
  async list(
    access: MemberAccess,
    filter: {
      status?: "pending" | "approved" | "rejected";
      projectId?: string | null;
      partyType?: PartyType;
    },
  ): Promise<SettlementView[]> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    let projectIds: string[] | null;
    if (filter.projectId != null) {
      assertOnPlace(access, "read", { kind: "project", id: filter.projectId });
      projectIds = [filter.projectId];
    } else
      projectIds =
        access.role === "owner"
          ? null
          : [...access.projectIds].filter((projectId) =>
              canOnPlace(access, "read", { kind: "project", id: projectId }),
            );
    const rows = await store.listSettlements(db, {
      workspaceId,
      status: filter.status,
      projectIds,
      includeStores: access.role === "owner" && filter.projectId == null,
      partyType: filter.partyType,
    });
    return this.views(access, rows);
  }

  async views(
    access: MemberAccess,
    rows: readonly StoredSettlement[],
  ): Promise<SettlementView[]> {
    if (rows.length === 0) return [];
    const { db, store, directory } = this.deps;
    const workspaceId = access.workspaceId;
    const invoices = await store.findInvoices(
      db,
      workspaceId,
      rows.map((row) => row.invoiceId),
    );
    const today = await this.deps.today(workspaceId);
    const [figures, parties, places, users] = await Promise.all([
      store.invoiceFigures(
        db,
        invoices.map((row) => row.id),
      ),
      partyNames(this.deps, db, workspaceId, invoices),
      placeNames(
        this.deps,
        db,
        workspaceId,
        invoices.map((row) => row.place),
      ),
      directory.userNames(
        db,
        workspaceId,
        rows.flatMap((row) =>
          row.decidedBy == null
            ? [row.createdBy]
            : [row.createdBy, row.decidedBy],
        ),
      ),
    ]);
    const byId = new Map(invoices.map((row) => [row.id, row]));
    return rows.flatMap((row) => {
      const invoice = byId.get(row.invoiceId);
      if (invoice == null) return [];
      const figure = figures.get(invoice.id) ?? {
        allocated: 0n,
        writtenOff: 0n,
      };
      const pending = row.approvalStatus === "pending";
      return [
        {
          ...row,
          raisedByName: users.get(row.createdBy) ?? null,
          decidedByName:
            row.decidedBy == null ? null : (users.get(row.decidedBy) ?? null),
          invoice: {
            id: invoice.id,
            partyType: invoice.partyType,
            partyId: invoice.partyId,
            partyName:
              parties.get(partyKey(invoice.partyType, invoice.partyId)) ?? null,
            place: invoice.place,
            placeName: places.get(placeKey(invoice.place)) ?? null,
            direction: invoice.direction,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            amount: invoice.amount,
            balance: invoiceProgress({ ...invoice, ...figure }, today).balance,
          },
          actions: {
            approve: pending && canOnPlace(access, "approve", invoice.place),
            reject: pending && canOnPlace(access, "reject", invoice.place),
          },
        },
      ];
    });
  }

  async get(access: MemberAccess, id: string): Promise<SettlementView> {
    const row = await this.find(access.workspaceId, id);
    const [view] = await this.views(access, [row]);
    if (view == null) throw settlementNotFound();
    return view;
  }
}
