import { can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { assertAccountUsable, assertModeReference } from "../domain/accounts";
import { invoiceProgress } from "../domain/invoice";
import type { PartyType, PaymentMode } from "../domain/ledger";
import {
  assertPartyOnPlace,
  optionalText,
  paiseFrom,
  PARTY_TEXT_LIMITS,
  placeFromInput,
  type PartyPlace,
} from "../domain/party";
import {
  assertClientDeductionsAllowed,
  assertDirection,
  assertTdsAllowed,
  checkAllocations,
  directionOfInvoices,
  paymentEntries,
  paymentReference,
  settledAmount,
  type AllocatableInvoice,
  type PaymentDirection,
} from "../domain/party-payment";
import {
  payeeKindOf,
  rateInForce,
  suggestTds,
  type TdsPayeeKind,
  type TdsSuggestion,
} from "../domain/tds";
import {
  financialYearOf,
  financialYearRange,
  gstShareOf,
  recordedTds,
} from "../domain/tds-payment";
import {
  assertOnPlace,
  assertPlaceExists,
  auditable,
  canOnPlace,
  loadParty,
  partyKey,
  partyNames,
  placeKey,
  placeNames,
} from "./party-common";
import type {
  FinanceTx,
  PageParams,
  PartyFinanceDeps,
  PaymentListFilter,
  StoredInvoice,
  StoredPartyPayment,
} from "./party-ports";
import type { ContractorFacts } from "./ports";

export const partyPaymentNotFound = () =>
  notFound("PARTY_PAYMENT_NOT_FOUND", "This payment was not found.");

/**
 * An advance's payment is changed in Contracts (CM-1108): it is applied
 * only by the bills that recover it, and cancelled by deleting the
 * advance (409 `PAYMENT_FROM_ADVANCE`).
 */
export const paymentFromAdvance = (label: string) =>
  conflict(
    "PAYMENT_FROM_ADVANCE",
    `This payment is the ${label}. Bills recover it in Contracts; delete the advance there to cancel it.`,
  );

export type AllocationRequest = { invoiceId: string; amount: number };

export type RecordPaymentInput = {
  partyType: PartyType;
  partyId: string;
  projectId?: string | null;
  storeId?: string | null;
  direction?: PaymentDirection;
  paymentDate: string;
  accountId: string;
  mode: PaymentMode;
  chequeNumber?: string | null;
  reference?: string | null;
  modeDate?: string | null;
  /** Paise moved. */
  amount: number;
  /** Paise deducted (Contractors). The server's suggestion is kept beside it. */
  tdsAmount?: number | null;
  tdsBase?: number | null;
  tdsRate?: string | null;
  tdsOverrideReason?: string | null;
  /** Paise of income-tax TDS the Client deducted (Client receipts, CM-1107). */
  clientTdsAmount?: number | null;
  /** Paise of GST-TDS (s.51) the Client deducted (Client receipts). */
  gstTdsAmount?: number | null;
  paymentCategoryId?: string | null;
  paidByMemberId?: string | null;
  remarks?: string | null;
  allocations?: readonly AllocationRequest[] | null;
  /** Save anyway when the cheque number or reference is already used. */
  confirmDuplicateReference?: boolean;
};

export type TdsSuggestionInput = {
  contractorId: string;
  projectId?: string | null;
  storeId?: string | null;
  paymentDate: string;
  /** Paise: paid + TDS. */
  settled: number;
  allocations?: readonly AllocationRequest[] | null;
  /** A payment to leave out of the year's figures. */
  exceptPaymentId?: string | null;
};

export type TdsSuggestionView = TdsSuggestion & { payeeKind: TdsPayeeKind };

export type PaymentActions = {
  cancel: boolean;
  applyAdvance: boolean;
  print: boolean;
};

export type PaymentView = StoredPartyPayment & {
  partyName: string | null;
  placeName: string | null;
  accountName: string | null;
  accountKind: string | null;
  paymentCategoryName: string | null;
  paidByName: string | null;
  /** Paid + TDS (out), or received + the TDS and GST-TDS the Client deducted (in). */
  settled: bigint;
  allocated: bigint;
  /** The advance: settled − allocated. */
  unallocated: bigint;
  tdsOverridden: boolean;
  /** CM-1108: the Contracts advance this payment moved ("mobilisation advance on WO/…"), or null. */
  contractAdvance: { label: string } | null;
  allocations: {
    id: string;
    invoiceId: string;
    invoiceNumber: string | null;
    invoiceDate: CalendarDate | null;
    amount: bigint;
  }[];
};

export function paymentActions(
  access: MemberAccess,
  view: Pick<PaymentView, "place" | "unallocated"> & {
    contractAdvance?: PaymentView["contractAdvance"];
  },
): PaymentActions {
  // An advance's payment is changed in Contracts (CM-1108).
  const fromAdvance = view.contractAdvance != null;
  return {
    cancel: !fromAdvance && canOnPlace(access, "delete", view.place),
    applyAdvance:
      !fromAdvance &&
      view.unallocated > 0n &&
      canOnPlace(access, "update", view.place),
    print: canOnPlace(access, "print", view.place),
  };
}

function snapshot(payment: StoredPartyPayment) {
  return auditable({
    number: payment.number,
    partyType: payment.partyType,
    partyId: payment.partyId,
    place: payment.place,
    direction: payment.direction,
    paymentDate: payment.paymentDate,
    accountId: payment.accountId,
    mode: payment.mode,
    chequeNumber: payment.chequeNumber,
    reference: payment.reference,
    amount: payment.amount,
    tdsAmount: payment.tdsAmount,
    tdsSuggested: payment.tdsSuggested,
    tdsBase: payment.tdsBase,
    tdsRate: payment.tdsRate,
    tdsOverrideReason: payment.tdsOverrideReason,
    clientTdsAmount: payment.clientTdsAmount,
    gstTdsAmount: payment.gstTdsAmount,
    paymentCategoryId: payment.paymentCategoryId,
    paidByMemberId: payment.paidByMemberId,
  });
}

function changed(payment: StoredPartyPayment, expectedUpdatedAt: Date): void {
  if (payment.updatedAt.getTime() !== expectedUpdatedAt.getTime())
    throw conflict(
      "PARTY_PAYMENT_CHANGED",
      "Someone changed this payment. Reload it and try again.",
      { updatedAt: payment.updatedAt.toISOString() },
    );
}

function allocationsFrom(
  raw: readonly AllocationRequest[] | null | undefined,
): { invoiceId: string; amount: bigint }[] {
  return (raw ?? []).map((allocation, index) => ({
    invoiceId: allocation.invoiceId,
    amount: paiseFrom(allocation.amount, `allocations.${String(index)}.amount`),
  }));
}

/**
 * Party payments (CM-705, CM-706, CM-708; ADR CM-0017 §6–§8): recorded
 * without approval, each in one transaction with its party entries, its
 * account entry and its allocations; Cancel reverses both ledgers and frees
 * the allocations; Apply advance allocates the unallocated part later.
 */
export class PartyPaymentHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: PartyFinanceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async find(workspaceId: string, id: string): Promise<StoredPartyPayment> {
    const payment = await this.deps.store.findPayment(
      this.deps.db,
      workspaceId,
      id,
    );
    if (payment == null) throw partyPaymentNotFound();
    return payment;
  }

  /** Locks the invoices and reads what each can still take. */
  private async allocatable(
    tx: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<{
    invoices: Map<string, AllocatableInvoice>;
    rows: Map<string, StoredInvoice>;
  }> {
    const { store } = this.deps;
    const locked = await store.lockInvoices(tx, workspaceId, ids);
    const figures = await store.invoiceFigures(
      tx,
      locked.map((row) => row.id),
    );
    const today = await this.deps.today(workspaceId);
    const invoices = new Map<string, AllocatableInvoice>();
    for (const row of locked) {
      const figure = figures.get(row.id) ?? { allocated: 0n, writtenOff: 0n };
      invoices.set(row.id, {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        partyType: row.partyType,
        partyId: row.partyId,
        place: row.place,
        direction: row.direction,
        settled: row.settledAt != null,
        balance: invoiceProgress({ ...row, ...figure }, today).balance,
      });
    }
    return { invoices, rows: new Map(locked.map((row) => [row.id, row])) };
  }

  /** The 194C suggestion for a Contractor payment (CM-0017 §8). */
  private async tdsFor(
    db: FinanceTx,
    workspaceId: string,
    contractor: ContractorFacts,
    paymentDate: CalendarDate,
    settled: bigint,
    gstShare: bigint,
    exceptId: string | null,
  ): Promise<TdsSuggestionView> {
    const payeeKind = payeeKindOf(contractor.pan);
    const rates = await this.deps.tdsRates(db);
    const rate = rateInForce(rates, "194C", payeeKind, paymentDate);
    if (rate == null)
      return {
        section: "194C",
        label: "194C",
        rate: "0.00",
        base: 0n,
        amount: 0n,
        reason: "not_applicable",
        catchUpBase: 0n,
        payeeKind,
      };
    const year = financialYearRange(financialYearOf(paymentDate));
    const prior = await this.deps.store.contractorYearToDate(
      db,
      workspaceId,
      contractor.id,
      { from: year.from, upTo: paymentDate },
      exceptId,
    );
    return {
      ...suggestTds({
        applicable: contractor.tdsApplicable,
        lowerRate: contractor.tdsLowerRate,
        rate,
        settled,
        gstShare,
        priorSettledInYear: prior.settled,
        priorUndeductedBaseInYear: prior.undeductedBase,
      }),
      payeeKind,
    };
  }

  private async contractor(
    db: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<ContractorFacts> {
    const found = (
      await this.deps.directory.contractors(db, workspaceId, [id])
    ).get(id);
    if (found == null)
      throw notFound("PARTY_NOT_FOUND", "This Contractor was not found.");
    return found;
  }

  /** `POST …/party-payments/tds-suggestion`: what the form shows before saving. */
  async tdsSuggestion(
    access: MemberAccess,
    input: TdsSuggestionInput,
  ): Promise<TdsSuggestionView> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const place = placeFromInput("contractor", input);
    assertOnPlace(access, "create", place);
    const contractor = await this.contractor(
      db,
      workspaceId,
      input.contractorId,
    );
    const paymentDate = assertCalendarDate(
      input.paymentDate,
      "PAYMENT_DATE_INVALID",
    );
    const settled = paiseFrom(input.settled, "settled", { allowZero: true });
    const allocations = allocationsFrom(input.allocations);
    const invoices = await store.findInvoices(
      db,
      workspaceId,
      allocations.map((allocation) => allocation.invoiceId),
    );
    const own = new Map(
      invoices
        .filter(
          (row) =>
            row.partyType === "contractor" && row.partyId === contractor.id,
        )
        .map((row) => [row.id, row]),
    );
    return this.tdsFor(
      db,
      workspaceId,
      contractor,
      paymentDate,
      settled,
      gstShareOf(allocations, own),
      input.exceptPaymentId ?? null,
    );
  }

  async record(
    access: MemberAccess,
    input: RecordPaymentInput,
  ): Promise<string> {
    return (await this.recordWith(access, input, null)).id;
  }

  /**
   * Records a payment inside the caller's transaction (CM-1108: an advance
   * given or received in Contracts is an on-account Payment Out or In,
   * committed with the advance). Every check `record` makes applies:
   * Parties Create on the place, the account and mode, the Back-dated Entry
   * policy, TDS. Returns the id and number.
   */
  async recordInside(
    tx: FinanceTx,
    access: MemberAccess,
    input: RecordPaymentInput,
  ): Promise<{ id: string; number: string }> {
    return this.recordWith(access, input, tx);
  }

  private async recordWith(
    access: MemberAccess,
    input: RecordPaymentInput,
    outer: FinanceTx | null,
  ): Promise<{ id: string; number: string }> {
    const { store, directory } = this.deps;
    const db: FinanceTx = outer ?? this.deps.db;
    const inTransaction = <T>(fn: (tx: FinanceTx) => Promise<T>): Promise<T> =>
      outer == null ? this.deps.db.$transaction(fn) : fn(outer);
    const workspaceId = access.workspaceId;
    const place = placeFromInput(input.partyType, input);
    assertOnPlace(access, "create", place);
    const direction = input.direction ?? "out";
    assertDirection(input.partyType, direction);
    await assertPlaceExists(this.deps, db, workspaceId, place);
    const party = await loadParty(
      this.deps,
      db,
      workspaceId,
      input.partyType,
      input.partyId,
    );
    assertPartyOnPlace(party, place);
    const paymentDate = assertCalendarDate(
      input.paymentDate,
      "PAYMENT_DATE_INVALID",
    );
    const modeDate =
      input.modeDate == null || input.modeDate === ""
        ? null
        : assertCalendarDate(input.modeDate, "MODE_DATE_INVALID");
    const amount = paiseFrom(input.amount, "amount");
    const tdsAmount = paiseFrom(input.tdsAmount ?? 0, "tdsAmount", {
      allowZero: true,
    });
    assertTdsAllowed(party.type, direction, tdsAmount);
    const clientTdsAmount = paiseFrom(
      input.clientTdsAmount ?? 0,
      "clientTdsAmount",
      { allowZero: true },
    );
    const gstTdsAmount = paiseFrom(input.gstTdsAmount ?? 0, "gstTdsAmount", {
      allowZero: true,
    });
    assertClientDeductionsAllowed(party.type, direction, {
      clientTdsAmount,
      gstTdsAmount,
    });
    const chequeNumber =
      input.mode === "cheque"
        ? optionalText(
            input.chequeNumber,
            "chequeNumber",
            PARTY_TEXT_LIMITS.reference,
          )
        : null;
    const reference = optionalText(
      input.reference,
      "reference",
      PARTY_TEXT_LIMITS.reference,
    );
    assertModeReference(input.mode, { chequeNumber, reference });
    const remarks = optionalText(
      input.remarks,
      "remarks",
      PARTY_TEXT_LIMITS.remarks,
    );
    const paymentCategoryId = input.paymentCategoryId ?? null;
    if (
      paymentCategoryId != null &&
      (await store.paymentCategoryLive(db, workspaceId, paymentCategoryId)) ==
        null
    )
      throw new DomainError(
        "PAYMENT_CATEGORY_NOT_FOUND",
        "This Payment Category was not found.",
        { details: { field: "paymentCategoryId" } },
      );
    let paidByMemberId = input.paidByMemberId ?? null;
    if (paidByMemberId != null) {
      const member = (
        await directory.teamMembers(db, workspaceId, [paidByMemberId])
      ).get(paidByMemberId);
      if (!member?.active)
        throw new DomainError(
          "PAID_BY_NOT_FOUND",
          "Choose an active Team Member.",
          { details: { field: "paidByMemberId" } },
        );
    } else
      paidByMemberId =
        (await directory.memberOfUser(db, workspaceId, access.userId))?.id ??
        null;
    const allocations = allocationsFrom(input.allocations);
    const contractor =
      party.type === "contractor" && direction === "out"
        ? await this.contractor(db, workspaceId, party.id)
        : null;
    const check = await this.deps.backdated(access);
    check.check("party_payment", "create", paymentDate);
    const actor = {
      userId: access.userId,
      anyPettyCash: can(access, "finance.petty_cash", "view_all"),
    };
    const id = newId();
    const at = this.clock();
    let issued = "";
    await inTransaction(async (tx) => {
      const account = await this.deps.accountFacts(
        tx,
        workspaceId,
        input.accountId,
      );
      assertAccountUsable(account, input.mode, actor);
      const ref = paymentReference(input.mode, { chequeNumber, reference });
      if (ref != null && input.confirmDuplicateReference !== true) {
        const duplicate = await store.duplicateReference(
          tx,
          workspaceId,
          account.id,
          ref,
        );
        if (duplicate != null)
          throw conflict(
            "DUPLICATE_REFERENCE",
            `This ${input.mode === "cheque" ? "cheque number" : "reference"} is already used on ${account.name}${duplicate.documentNumber == null ? "" : ` (${duplicate.documentNumber})`}. Check it, or save anyway.`,
            {
              field: input.mode === "cheque" ? "chequeNumber" : "reference",
              documentNumber: duplicate.documentNumber,
            },
          );
      }
      const settled = settledAmount({
        amount,
        tdsAmount,
        clientTdsAmount,
        gstTdsAmount,
      });
      const { invoices, rows } = await this.allocatable(
        tx,
        workspaceId,
        allocations.map((allocation) => allocation.invoiceId),
      );
      checkAllocations({
        partyType: party.type,
        partyId: party.id,
        place,
        direction,
        available: settled,
        allocations,
        invoices,
      });
      let tds = null;
      if (contractor != null) {
        const suggestion = await this.tdsFor(
          tx,
          workspaceId,
          contractor,
          paymentDate,
          settled,
          gstShareOf(allocations, rows),
          null,
        );
        tds = recordedTds(suggestion, {
          amount: tdsAmount,
          base:
            input.tdsBase == null
              ? null
              : paiseFrom(input.tdsBase, "tdsBase", { allowZero: true }),
          rate: input.tdsRate ?? null,
          overrideReason: input.tdsOverrideReason ?? null,
        });
        if (tds.amount === 0n && tds.overrideReason == null) {
          // No deduction: keep this payment's own base for a later catch-up.
          const own = settled - gstShareOf(allocations, rows);
          tds = { ...tds, base: own > 0n ? own : 0n };
        }
      }
      const { number } = await nextSequenceNumber(tx, {
        workspaceId,
        module: "party_payment",
        projectId: place.kind === "project" ? place.id : null,
        date: paymentDate,
        by: access.userId,
      });
      const row: StoredPartyPayment = {
        id,
        workspaceId,
        number,
        partyType: party.type,
        partyId: party.id,
        place,
        direction,
        paymentDate,
        accountId: account.id,
        mode: input.mode,
        chequeNumber,
        reference,
        modeDate,
        amount,
        tdsSection: tds?.section ?? null,
        tdsBase: tds?.base ?? null,
        tdsRate: tds?.rate ?? null,
        tdsAmount,
        tdsSuggested: tds?.suggested ?? null,
        tdsOverrideReason: tds?.overrideReason ?? null,
        clientTdsAmount,
        gstTdsAmount,
        paymentCategoryId,
        paidByMemberId,
        remarks,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insertPayment(tx, row);
      await store.insertAllocations(
        tx,
        workspaceId,
        access.userId,
        id,
        allocations,
      );
      const entries = paymentEntries({
        ...row,
        partyName: party.name,
        reference: paymentReference(input.mode, { chequeNumber, reference }),
      });
      await this.deps.ledgers.party.post(
        tx,
        workspaceId,
        access.userId,
        entries.party,
      );
      await this.deps.ledgers.account.post(tx, workspaceId, access.userId, [
        entries.account,
      ]);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "party_payment.recorded",
        entityType: "party_payment",
        entityId: id,
        after: {
          ...snapshot(row),
          allocations: allocations.map((allocation) => auditable(allocation)),
        },
        occurredAt: at,
      });
      issued = number;
    });
    return { id, number: issued };
  }

  /**
   * **Cancel** (CM-0017 §6): reverses the party and account entries,
   * frees the allocations and tombstones the payment. Not on or before the
   * Financial Closing Date, and not when an invoice it settles has since
   * been written off (409 `INVOICE_SETTLED`).
   */
  async cancel(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void> {
    const current = await this.find(access.workspaceId, id);
    assertOnPlace(access, "delete", current.place);
    const advance = (
      await this.deps.directory.contractAdvances(
        this.deps.db,
        access.workspaceId,
        [id],
      )
    ).get(id);
    if (advance != null) throw paymentFromAdvance(advance.label);
    await this.deps.db.$transaction((tx) =>
      this.cancelWith(tx, access, id, expectedUpdatedAt),
    );
  }

  /**
   * Cancels an advance's payment inside the caller's transaction, when
   * Contracts deletes the advance (CM-1108). Parties Delete on the place,
   * the Back-dated Entry policy and the written-off check apply as in
   * `cancel`.
   */
  async cancelInside(
    tx: FinanceTx,
    access: MemberAccess,
    id: string,
  ): Promise<void> {
    const current = await this.deps.store.findPayment(
      tx,
      access.workspaceId,
      id,
    );
    if (current == null) throw partyPaymentNotFound();
    assertOnPlace(access, "delete", current.place);
    await this.cancelWith(tx, access, id, null);
  }

  private async cancelWith(
    tx: FinanceTx,
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const { store, ledgers } = this.deps;
    const workspaceId = access.workspaceId;
    const check = await this.deps.backdated(access);
    const at = this.clock();
    {
      const locked = await store.lockPayment(tx, workspaceId, id);
      if (locked == null) throw partyPaymentNotFound();
      if (expectedUpdatedAt != null) changed(locked, expectedUpdatedAt);
      check.check("party_payment", "edit", locked.paymentDate);
      const allocations = await store.allocationsOfPayments(tx, [id]);
      const invoices = await store.lockInvoices(
        tx,
        workspaceId,
        allocations.map((allocation) => allocation.invoiceId),
      );
      const settled = invoices.find((invoice) => invoice.settledAt != null);
      if (settled != null)
        throw conflict(
          "INVOICE_SETTLED",
          `Invoice ${settled.invoiceNumber}, which this payment settles, has been written off. The payment cannot be cancelled.`,
        );
      await ledgers.party.reverseSource(
        tx,
        workspaceId,
        access.userId,
        "party_payment",
        id,
      );
      await ledgers.account.reverseSource(
        tx,
        workspaceId,
        access.userId,
        "party_payment",
        id,
      );
      await store.tombstoneAllocations(tx, id, access.userId, at);
      await store.tombstonePayment(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "party_payment.cancelled",
        entityType: "party_payment",
        entityId: id,
        before: {
          ...snapshot(locked),
          allocations: allocations.map((allocation) =>
            auditable({
              invoiceId: allocation.invoiceId,
              amount: allocation.amount,
            }),
          ),
        },
        occurredAt: at,
      });
    }
  }

  /**
   * **Apply advance** (CM-0017 §7): allocates the unallocated part of a
   * payment to open invoices of the same party and place. No money moves.
   */
  async applyAdvance(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    raw: readonly AllocationRequest[],
  ): Promise<void> {
    const { db, store } = this.deps;
    const workspaceId = access.workspaceId;
    const current = await this.find(workspaceId, id);
    assertOnPlace(access, "update", current.place);
    const advance = (
      await this.deps.directory.contractAdvances(db, workspaceId, [id])
    ).get(id);
    if (advance != null) throw paymentFromAdvance(advance.label);
    const allocations = allocationsFrom(raw);
    if (allocations.length === 0)
      throw new DomainError(
        "ALLOCATION_REQUIRED",
        "Choose at least one invoice.",
        { details: { field: "allocations" } },
      );
    const at = this.clock();
    await db.$transaction(async (tx) => {
      const locked = await store.lockPayment(tx, workspaceId, id);
      if (locked == null) throw partyPaymentNotFound();
      changed(locked, expectedUpdatedAt);
      const existing = await store.allocationsOfPayments(tx, [id]);
      const allocated = existing.reduce((sum, row) => sum + row.amount, 0n);
      const available = settledAmount(locked) - allocated;
      const { invoices } = await this.allocatable(
        tx,
        workspaceId,
        allocations.map((allocation) => allocation.invoiceId),
      );
      checkAllocations({
        partyType: locked.partyType,
        partyId: locked.partyId,
        place: locked.place,
        direction: locked.direction,
        available,
        allocations,
        invoices,
      });
      await store.insertAllocations(
        tx,
        workspaceId,
        access.userId,
        id,
        allocations,
      );
      await store.touchPayment(tx, id, access.userId, at);
      await recordAudit(tx, {
        workspaceId,
        actorUserId: access.userId,
        action: "party_payment.advance_applied",
        entityType: "party_payment",
        entityId: id,
        after: {
          allocations: allocations.map((allocation) => auditable(allocation)),
        },
        occurredAt: at,
      });
    });
  }

  async views(
    workspaceId: string,
    rows: readonly StoredPartyPayment[],
  ): Promise<PaymentView[]> {
    if (rows.length === 0) return [];
    const { db, store, directory } = this.deps;
    const ids = rows.map((row) => row.id);
    const [
      allocations,
      parties,
      places,
      accounts,
      categories,
      members,
      advances,
    ] = await Promise.all([
      store.allocationsOfPayments(db, ids),
      partyNames(this.deps, db, workspaceId, rows),
      placeNames(
        this.deps,
        db,
        workspaceId,
        rows.map((row) => row.place),
      ),
      store.accountNames(
        db,
        workspaceId,
        rows.map((row) => row.accountId),
      ),
      store.paymentCategoryNames(
        db,
        workspaceId,
        rows.flatMap((row) =>
          row.paymentCategoryId == null ? [] : [row.paymentCategoryId],
        ),
      ),
      directory.teamMembers(
        db,
        workspaceId,
        rows.flatMap((row) =>
          row.paidByMemberId == null ? [] : [row.paidByMemberId],
        ),
      ),
      directory.contractAdvances(db, workspaceId, ids),
    ]);
    const invoices = new Map(
      (
        await store.findInvoices(
          db,
          workspaceId,
          allocations.map((allocation) => allocation.invoiceId),
        )
      ).map((row) => [row.id, row]),
    );
    return rows.map((row) => {
      const own = allocations.filter(
        (allocation) => allocation.paymentId === row.id,
      );
      const allocated = own.reduce((sum, item) => sum + item.amount, 0n);
      const settled = settledAmount(row);
      const account = accounts.get(row.accountId);
      return {
        ...row,
        partyName: parties.get(partyKey(row.partyType, row.partyId)) ?? null,
        placeName: places.get(placeKey(row.place)) ?? null,
        accountName: account?.name ?? null,
        accountKind: account?.kind ?? null,
        paymentCategoryName:
          row.paymentCategoryId == null
            ? null
            : (categories.get(row.paymentCategoryId) ?? null),
        paidByName:
          row.paidByMemberId == null
            ? null
            : (members.get(row.paidByMemberId)?.name ?? null),
        settled,
        allocated,
        unallocated: settled - allocated,
        tdsOverridden:
          row.tdsSuggested != null && row.tdsSuggested !== row.tdsAmount,
        contractAdvance: advances.get(row.id) ?? null,
        allocations: own.map((allocation) => {
          const invoice = invoices.get(allocation.invoiceId);
          return {
            id: allocation.id,
            invoiceId: allocation.invoiceId,
            invoiceNumber: invoice?.invoiceNumber ?? null,
            invoiceDate: invoice?.invoiceDate ?? null,
            amount: allocation.amount,
          };
        }),
      };
    });
  }

  async get(workspaceId: string, id: string): Promise<PaymentView> {
    const payment = await this.find(workspaceId, id);
    const [view] = await this.views(workspaceId, [payment]);
    if (view == null) throw partyPaymentNotFound();
    return view;
  }

  async list(
    filter: PaymentListFilter,
    page: PageParams,
  ): Promise<{ items: PaymentView[]; hasMore: boolean; total: number }> {
    const { db, store } = this.deps;
    const found = await store.listPaymentIds(db, filter, page);
    const rows = await store.findPayments(
      db,
      filter.workspaceId,
      found.items.map((item) => item.id),
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = found.items.flatMap((item) => {
      const row = byId.get(item.id);
      return row == null ? [] : [row];
    });
    return {
      items: await this.views(filter.workspaceId, ordered),
      hasMore: found.hasMore,
      total: found.total,
    };
  }

  /** The receipt's data: the payment as viewed and the Company's name. */
  async printable(
    workspaceId: string,
    id: string,
  ): Promise<{ view: PaymentView; company: string }> {
    const [view, company] = await Promise.all([
      this.get(workspaceId, id),
      this.deps.store.companyName(this.deps.db, workspaceId),
    ]);
    return { view, company };
  }

  /** Invoices a payment of this direction settles (the allocation table's kind). */
  static invoiceDirectionOf = directionOfInvoices;

  /** Exposed for the routes: where a payment request belongs. */
  static placeOf(input: {
    partyType: PartyType;
    projectId?: string | null;
    storeId?: string | null;
  }): PartyPlace {
    return placeFromInput(input.partyType, input);
  }
}
