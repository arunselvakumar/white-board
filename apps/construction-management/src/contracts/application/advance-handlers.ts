import {
  assertCan,
  can,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import {
  advanceBalance,
  advanceFields,
  advanceRecovery,
  advanceRemarks,
  advanceWarnings,
  completionDate,
  dlpPeriod,
  guaranteeFields,
  guaranteeReleaseDate,
  guaranteeStatus,
  releaseDeleteReason,
  releaseFields,
  retentionPosition,
  type AdvanceInput,
  type AdvanceRecoveryInput,
  type AdvanceWarning,
  type DlpPeriod,
  type GuaranteeInput,
  type GuaranteeStatus,
  type RecoverableAdvance,
  type ReleaseInput,
  type RetentionPosition,
} from "../domain/advance";
import {
  ADVANCE_KIND_LABELS,
  RETENTION_STAGE_LABELS,
  type AdvanceKind,
} from "../domain/contract-terms";
import { DEFAULT_CLIENT_CONTRACT_TERMS } from "../domain/client-bill";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import { workOrderNotFound } from "../domain/work-order";
import type {
  AdvanceDeps,
  AdvanceStore,
  ContractRef,
  StoredAdvance,
  StoredGuarantee,
  StoredRelease,
} from "./advance-ports";
import { CLIENT_BILL_MENU } from "./client-bill-ports";
import type { ContractsProjectFacts, ContractsTx } from "./ports";
import { WORK_ORDER_MENU, type StoredWorkOrder } from "./work-order-ports";

/** The finance menu whose Create a given or received advance needs (it moves money). */
const PARTIES_MENU = "finance.parties";

export type AdvanceMenu = typeof WORK_ORDER_MENU | typeof CLIENT_BILL_MENU;

/** The menu that guards one side: Work Order (contractor) or Client Bills (client). */
export function menuOfSide(side: "contractor" | "client"): AdvanceMenu {
  return side === "contractor" ? WORK_ORDER_MENU : CLIENT_BILL_MENU;
}

/** Which contract a request is about: a Work Order, or the Project's client contract. */
export type ContractInput = { projectId: string; workOrderId?: string | null };

export type AdvanceCommand = AdvanceInput & {
  /** The finance account the money moved through, and how (like a party payment). */
  accountId: string;
  mode: "cash" | "cheque" | "online" | "upi";
  chequeNumber?: string | null;
  reference?: string | null;
  modeDate?: string | null;
  confirmDuplicateReference?: boolean;
};

export type AdvanceUpdateCommand = AdvanceRecoveryInput & {
  /** Changeable while no bill recovers the advance. */
  kind?: string | null;
  remarks?: string | null;
};

// ---------------------------------------------------------------------------
// What screens read
// ---------------------------------------------------------------------------

export type AdvanceView = StoredAdvance & {
  paymentNumber: string | null;
  /** Σ recoveries on approved bills. */
  recovered: bigint;
  balance: bigint;
  /** Live guarantees securing it. */
  guaranteeIds: string[];
};

export type GuaranteeView = StoredGuarantee & {
  status: GuaranteeStatus;
  /** Days from today to expiry (negative once past). */
  daysToExpiry: number;
  advanceKind: AdvanceKind | null;
};

export type ReleaseView = StoredRelease & {
  guaranteeNumber: string | null;
  invoiceNumber: string | null;
  /** Anything paid or received against the release's invoice: it can no longer be deleted. */
  settled: boolean;
  createdByName: string | null;
};

export type AdvancesAndRetention = {
  side: "contractor" | "client";
  projectId: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  workOrderStatus: StoredWorkOrder["status"] | null;
  /** The Contractor (Work Order) or the Client (client contract). */
  partyId: string | null;
  partyName: string | null;
  advances: AdvanceView[];
  advanceTotals: { amount: bigint; recovered: bigint; balance: bigint };
  /** The Work Order's agreed mobilisation advance; null on the client side. */
  agreedMobilisation: bigint | null;
  /** The Work Order's recovery % (the default for a new mobilisation advance). */
  defaultRecoveryPercent: bigint | null;
  warnings: AdvanceWarning[];
  retentionPercent: bigint;
  retention: RetentionPosition;
  releases: ReleaseView[];
  guarantees: GuaranteeView[];
  dlp: DlpPeriod;
  allowed: {
    /** Update + Financial (+ finance Parties Create for an advance). */
    recordAdvance: boolean;
    update: boolean;
    delete: boolean;
    /** Approve: a DLP-end release before the DLP ends (with a reason). */
    releaseEarly: boolean;
    /** Work Order Update on an issued or closed Work Order. */
    setCompletion: boolean;
  };
  financial: boolean;
  viewerFlags: Flag[];
  today: CalendarDate;
};

/**
 * The advances of a contract as a bill sees them (CM-1108): with what
 * approved bills other than `exceptBillId` recovered.
 */
export async function recoverableAdvances(
  store: AdvanceStore,
  db: ContractsTx,
  workspaceId: string,
  contract: ContractRef,
  exceptBillId: string | null,
): Promise<RecoverableAdvance[]> {
  const advances = await store.advances(db, workspaceId, contract);
  const recovered = await store.recovered(
    db,
    workspaceId,
    advances.map((row) => row.id),
    exceptBillId,
  );
  return advances.map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    advanceOn: row.advanceOn,
    recoveryMode: row.recoveryMode,
    recoveryValue: row.recoveryValue,
    recovered: recovered.get(row.id) ?? 0n,
    paymentId: row.paymentId,
  }));
}

function isAdvanceKind(value: string): value is AdvanceKind {
  return value === "mobilisation" || value === "secured";
}

const advanceNotFound = () =>
  notFound("ADVANCE_NOT_FOUND", "This advance was not found.");
const guaranteeNotFound = () =>
  notFound("GUARANTEE_NOT_FOUND", "This bank guarantee was not found.");
const releaseNotFound = () =>
  notFound(
    "RETENTION_RELEASE_NOT_FOUND",
    "This retention release was not found.",
  );
const changed = (what: string, code: string) =>
  conflict(
    code,
    `Someone changed this ${what} after you opened it. Reload to see the latest.`,
  );

/**
 * Advances, bank guarantees, retention release and DLP on both sides of a
 * contract (CM-1108, ADR CM-0023 §8). The contractor side is a Work Order
 * (menu `contracts.work_orders`), the client side the Project's client
 * contract (menu `contracts.client_bills`): Read sees, Update records and
 * edits, Delete deletes, Financial is needed for money (and to record
 * anything with an amount), Approve releases DLP-end retention early.
 * Recording an advance also needs finance Parties Create on the Project
 * (finance's own payment command checks it), deleting one Parties Delete.
 * Every command takes the Project's BOQ lock, like bills.
 */
export class AdvanceHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: AdvanceDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async findAdvance(workspaceId: string, id: string): Promise<StoredAdvance> {
    const found = await this.deps.store.findAdvance(
      this.deps.db,
      workspaceId,
      id,
    );
    if (found == null) throw advanceNotFound();
    return found;
  }

  async findGuarantee(
    workspaceId: string,
    id: string,
  ): Promise<StoredGuarantee> {
    const found = await this.deps.store.findGuarantee(
      this.deps.db,
      workspaceId,
      id,
    );
    if (found == null) throw guaranteeNotFound();
    return found;
  }

  async findRelease(workspaceId: string, id: string): Promise<StoredRelease> {
    const found = await this.deps.store.findRelease(
      this.deps.db,
      workspaceId,
      id,
    );
    if (found == null) throw releaseNotFound();
    return found;
  }

  private async project(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsProjectFacts> {
    const project = await this.deps.directory.project(
      db,
      workspaceId,
      projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    return project;
  }

  /** The Work Order of a contractor-side request, of this Project (404 otherwise). */
  private async workOrder(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    workOrderId: string,
  ): Promise<StoredWorkOrder> {
    const found = await this.deps.workOrders.find(db, workspaceId, workOrderId);
    if (found?.projectId !== projectId) throw workOrderNotFound();
    return found;
  }

  /** A contract from a request: the Work Order's when one is named, else the client contract. */
  contractOf(input: ContractInput): ContractRef {
    const workOrderId = input.workOrderId?.trim() ?? "";
    return workOrderId === ""
      ? { side: "client", projectId: input.projectId }
      : { side: "contractor", projectId: input.projectId, workOrderId };
  }

  /** The contract a stored record belongs to. */
  contractOfRecord(record: {
    projectId: string;
    workOrderId: string | null;
  }): ContractRef {
    return this.contractOf(record);
  }

  private assertFlag(
    access: MemberAccess,
    contract: ContractRef,
    flag: Flag,
  ): void {
    assertCan(access, menuOfSide(contract.side), flag, {
      projectId: contract.projectId,
    });
  }

  private financial(access: MemberAccess, contract: ContractRef): boolean {
    return can(access, menuOfSide(contract.side), "financial", {
      projectId: contract.projectId,
    });
  }

  /** Money is recorded with Financial (403 without it). */
  private assertFinancial(access: MemberAccess, contract: ContractRef): void {
    if (!this.financial(access, contract))
      throw forbidden(
        "PERMISSION_DENIED",
        "Recording money here needs the Financial permission. Ask the Owner to change your Permission Matrix.",
      );
  }

  private viewerFlags(access: MemberAccess, contract: ContractRef): Flag[] {
    const flags: Flag[] = [
      "read",
      "create",
      "update",
      "delete",
      "approve",
      "financial",
    ];
    return flags.filter((flag) =>
      can(access, menuOfSide(contract.side), flag, {
        projectId: contract.projectId,
      }),
    );
  }

  /** The terms the side reads: retention %, release share, DLP months and start. */
  private async terms(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<{
    workOrder: StoredWorkOrder | null;
    retentionPercent: bigint;
    completionPercent: bigint;
    dlpMonths: number | null;
    startsOn: CalendarDate | null;
  }> {
    if (contract.side === "contractor") {
      const workOrder = await this.workOrder(
        db,
        workspaceId,
        contract.projectId,
        contract.workOrderId,
      );
      return {
        workOrder,
        retentionPercent: workOrder.terms.retentionPercent,
        completionPercent: workOrder.terms.retentionCompletionPercent,
        dlpMonths: workOrder.terms.dlpMonths,
        startsOn: workOrder.completedOn,
      };
    }
    const row = await this.deps.clientBills.contract(
      db,
      workspaceId,
      contract.projectId,
    );
    const terms = row?.terms ?? DEFAULT_CLIENT_CONTRACT_TERMS;
    return {
      workOrder: null,
      retentionPercent: terms.retentionPercent,
      completionPercent: terms.retentionCompletionPercent,
      dlpMonths: terms.dlpMonths,
      startsOn: terms.handoverOn,
    };
  }

  /** Recording on a Work Order needs it issued or closed (409 `ADVANCE_WORK_ORDER_NOT_ISSUED`). */
  private assertWorkOrderLive(workOrder: StoredWorkOrder | null): void {
    if (
      workOrder != null &&
      workOrder.status !== "issued" &&
      workOrder.status !== "closed"
    )
      throw conflict(
        "ADVANCE_WORK_ORDER_NOT_ISSUED",
        "Advances, guarantees and releases are recorded on an issued or closed Work Order.",
        { status: workOrder.status },
      );
  }

  /** The client side needs the Project's Client (400 `PROJECT_CLIENT_REQUIRED`). */
  private clientOf(project: ContractsProjectFacts): string {
    if (project.clientId == null)
      throw new DomainError(
        "PROJECT_CLIENT_REQUIRED",
        "Pick the Project's Client first: advances and releases on the client contract are with it.",
      );
    return project.clientId;
  }

  private async audit(
    tx: ContractsTx,
    access: MemberAccess,
    action: string,
    entityType: string,
    id: string,
    at: Date,
    change: { before?: unknown; after?: unknown },
  ): Promise<void> {
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action,
      entityType,
      entityId: id,
      ...change,
      occurredAt: at,
    });
  }

  // Reads ---------------------------------------------------------------------

  /** Advances, guarantees, retention and DLP of one contract (Read). */
  async overview(
    access: MemberAccess,
    input: ContractInput,
  ): Promise<AdvancesAndRetention> {
    const contract = this.contractOf(input);
    this.assertFlag(access, contract, "read");
    const { db } = this.deps;
    await this.project(db, access.workspaceId, contract.projectId);
    return this.read(access, contract, db);
  }

  private async read(
    access: MemberAccess,
    contract: ContractRef,
    db: ContractsTx,
  ): Promise<AdvancesAndRetention> {
    const { store, directory, invoicing, payments } = this.deps;
    const ws = access.workspaceId;
    const [project, terms, advances, guarantees, releases, deducted, today] =
      await Promise.all([
        this.project(db, ws, contract.projectId),
        this.terms(db, ws, contract),
        store.advances(db, ws, contract),
        store.guarantees(db, ws, contract),
        store.releases(db, ws, contract),
        store.retentionDeducted(db, ws, contract),
        this.deps.today(ws),
      ]);
    const workOrder = terms.workOrder;
    const partyId =
      workOrder != null ? workOrder.contractorId : project.clientId;
    const [recovered, paymentNumbers, invoices, parties, names] =
      await Promise.all([
        store.recovered(
          db,
          ws,
          advances.map((row) => row.id),
          null,
        ),
        payments.numbers(
          db,
          ws,
          advances.flatMap((row) =>
            row.paymentId == null ? [] : [row.paymentId],
          ),
        ),
        invoicing.invoiceStates(
          db,
          ws,
          releases.flatMap((row) =>
            row.invoiceId == null ? [] : [row.invoiceId],
          ),
        ),
        workOrder != null
          ? directory
              .contractors(db, ws, contract.projectId, [workOrder.contractorId])
              .then((rows) => rows.get(workOrder.contractorId)?.name ?? null)
          : partyId == null
            ? Promise.resolve(null)
            : directory
                .clients(db, ws, [partyId])
                .then((rows) => rows.get(partyId)?.name ?? null),
        this.deps.clientBills.names(db, ws, [
          ...new Set(releases.map((row) => row.createdBy)),
        ]),
      ]);
    const guaranteeNumbers = new Map(
      guarantees.map((row) => [row.id, row.number]),
    );
    const advanceViews: AdvanceView[] = advances.map((row) => {
      const done = recovered.get(row.id) ?? 0n;
      return {
        ...row,
        paymentNumber:
          row.paymentId == null
            ? null
            : (paymentNumbers.get(row.paymentId) ?? null),
        recovered: done,
        balance: advanceBalance({ amount: row.amount, recovered: done }),
        guaranteeIds: guarantees
          .filter((guarantee) => guarantee.advanceId === row.id)
          .map((guarantee) => guarantee.id),
      };
    });
    const released = releases.reduce((sum, row) => sum + row.amount, 0n);
    const kinds = new Map(advances.map((row) => [row.id, row.kind]));
    const flagOn = (flag: Flag) =>
      can(access, menuOfSide(contract.side), flag, {
        projectId: contract.projectId,
      });
    const financial = flagOn("financial");
    const live =
      workOrder == null ||
      workOrder.status === "issued" ||
      workOrder.status === "closed";
    const update = flagOn("update") && live;
    return {
      side: contract.side,
      projectId: contract.projectId,
      workOrderId: workOrder?.id ?? null,
      workOrderNumber: workOrder?.number ?? null,
      workOrderStatus: workOrder?.status ?? null,
      partyId,
      partyName: parties,
      advances: advanceViews,
      advanceTotals: {
        amount: advanceViews.reduce((sum, row) => sum + row.amount, 0n),
        recovered: advanceViews.reduce((sum, row) => sum + row.recovered, 0n),
        balance: advanceViews.reduce((sum, row) => sum + row.balance, 0n),
      },
      agreedMobilisation: workOrder?.terms.mobilisationAdvance ?? null,
      defaultRecoveryPercent:
        workOrder?.terms.mobilisationRecoveryPercent ?? null,
      warnings:
        workOrder == null
          ? []
          : advanceWarnings({
              agreed: workOrder.terms.mobilisationAdvance,
              mobilisationGiven: advances
                .filter((row) => row.kind === "mobilisation")
                .reduce((sum, row) => sum + row.amount, 0n),
            }),
      retentionPercent: terms.retentionPercent,
      retention: retentionPosition({
        deducted,
        released,
        completionPercent: terms.completionPercent,
      }),
      releases: releases.map((row) => {
        const invoice =
          row.invoiceId == null ? undefined : invoices.get(row.invoiceId);
        return {
          ...row,
          guaranteeNumber:
            row.bankGuaranteeId == null
              ? null
              : (guaranteeNumbers.get(row.bankGuaranteeId) ?? null),
          invoiceNumber: invoice?.number ?? null,
          settled: invoice?.settled ?? false,
          createdByName: names.get(row.createdBy) ?? null,
        };
      }),
      guarantees: guarantees.map((row) => ({
        ...row,
        status: guaranteeStatus(row, today),
        daysToExpiry: daysBetween(today, row.expiresOn),
        advanceKind:
          row.advanceId == null ? null : (kinds.get(row.advanceId) ?? null),
      })),
      dlp: dlpPeriod(terms.startsOn, terms.dlpMonths, today),
      allowed: {
        recordAdvance:
          update &&
          financial &&
          can(access, PARTIES_MENU, "create", {
            projectId: contract.projectId,
          }),
        update,
        delete: flagOn("delete"),
        releaseEarly: flagOn("approve"),
        setCompletion:
          contract.side === "contractor" && flagOn("update") && live,
      },
      financial,
      viewerFlags: this.viewerFlags(access, contract),
      today,
    };
  }

  // Advances ------------------------------------------------------------------

  /**
   * Records an advance (Update + Financial): given to the Work Order's
   * Contractor (an on-account Payment Out) or received from the Project's
   * Client (an on-account Payment In), through finance's payment command in
   * the same transaction (which needs finance Parties Create on the
   * Project). Its id is kept as the advance's `payment_id`.
   */
  async recordAdvance(
    access: MemberAccess,
    input: ContractInput & AdvanceCommand,
  ): Promise<AdvancesAndRetention> {
    const contract = this.contractOf(input);
    this.assertFlag(access, contract, "update");
    this.assertFinancial(access, contract);
    const { db, store, boq, payments } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(db, ws, contract.projectId);
    const today = await this.deps.today(ws);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const { workOrder } = await this.terms(tx, ws, contract);
      this.assertWorkOrderLive(workOrder);
      const clientId = workOrder == null ? this.clientOf(project) : null;
      const fields = advanceFields(input, {
        today,
        defaultPercent: workOrder?.terms.mobilisationRecoveryPercent ?? null,
      });
      const id = newId(at.getTime());
      const label = `${ADVANCE_KIND_LABELS[fields.kind]} ${
        workOrder == null
          ? "received on the client contract"
          : `on Work Order ${workOrder.number ?? ""}`.trim()
      }`;
      const paid = await payments.record(tx, access, {
        partyType: workOrder == null ? "client" : "contractor",
        partyId: workOrder?.contractorId ?? clientId ?? "",
        projectId: contract.projectId,
        direction: workOrder == null ? "in" : "out",
        paymentDate: fields.advanceOn,
        accountId: input.accountId,
        mode: input.mode,
        chequeNumber: input.chequeNumber ?? null,
        reference: input.reference ?? null,
        modeDate: input.modeDate ?? null,
        amount: fields.amount,
        remarks: fields.remarks == null ? label : `${label}. ${fields.remarks}`,
        confirmDuplicateReference: input.confirmDuplicateReference === true,
      });
      const row: StoredAdvance = {
        id,
        workspaceId: ws,
        projectId: contract.projectId,
        direction: workOrder == null ? "received" : "given",
        kind: fields.kind,
        workOrderId: workOrder?.id ?? null,
        clientId,
        amount: fields.amount,
        advanceOn: fields.advanceOn,
        recoveryMode: fields.recoveryMode,
        recoveryValue: fields.recoveryValue,
        paymentId: paid.paymentId,
        remarks: fields.remarks,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insertAdvance(tx, row);
      await this.audit(tx, access, "advance.recorded", "advance", id, at, {
        after: advanceSnapshot(row, paid.number),
      });
      return this.read(access, contract, tx);
    });
  }

  /**
   * Changes how an advance is recovered and its remarks (Update +
   * Financial; 409 `ADVANCE_CHANGED` when stale). The kind changes only
   * while no live bill recovers it (409 `ADVANCE_RECOVERED`). The amount,
   * date and payment are fixed: delete and record it again.
   */
  async updateAdvance(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: AdvanceUpdateCommand,
  ): Promise<AdvancesAndRetention> {
    const before = await this.findAdvance(access.workspaceId, id);
    const contract = this.contractOfRecord(before);
    this.assertFlag(access, contract, "update");
    this.assertFinancial(access, contract);
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const current = await store.findAdvance(tx, ws, id);
      if (current == null) throw advanceNotFound();
      if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw changed("advance", "ADVANCE_CHANGED");
      const { workOrder } = await this.terms(tx, ws, contract);
      const kindRaw = input.kind?.trim() ?? "";
      const kind = kindRaw === "" ? current.kind : kindRaw;
      if (!isAdvanceKind(kind))
        throw new DomainError(
          "ADVANCE_KIND_INVALID",
          "Pick mobilisation or secured advance.",
          { details: { field: "kind" } },
        );
      if (kind !== current.kind) {
        const count = await store.billsRecovering(tx, ws, id);
        if (count > 0)
          throw conflict(
            "ADVANCE_RECOVERED",
            "Bills already recover this advance, so its kind cannot change.",
            { count },
          );
      }
      const recovery = advanceRecovery(input, {
        amount: current.amount,
        defaultPercent:
          kind === "mobilisation"
            ? (workOrder?.terms.mobilisationRecoveryPercent ?? null)
            : null,
      });
      const remarks = advanceRemarks(input.remarks);
      const after: StoredAdvance = {
        ...current,
        kind,
        recoveryMode: recovery.recoveryMode,
        recoveryValue: recovery.recoveryValue,
        remarks,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.updateAdvance(tx, after, current.updatedAt)))
        throw changed("advance", "ADVANCE_CHANGED");
      await this.audit(tx, access, "advance.updated", "advance", id, at, {
        before: advanceSnapshot(current, null),
        after: advanceSnapshot(after, null),
      });
      return this.read(access, contract, tx);
    });
  }

  /**
   * Deletes an advance (Delete): only while no live bill names it (409
   * `ADVANCE_RECOVERED`) and no guarantee secures it (409
   * `ADVANCE_HAS_GUARANTEE`). Its payment is cancelled in finance in the
   * same transaction (finance Parties Delete, the Back-dated Entry policy).
   */
  async deleteAdvance(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<AdvancesAndRetention> {
    const before = await this.findAdvance(access.workspaceId, id);
    const contract = this.contractOfRecord(before);
    this.assertFlag(access, contract, "delete");
    const { db, store, boq, payments } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const current = await store.findAdvance(tx, ws, id);
      if (current == null) throw advanceNotFound();
      if (
        expectedUpdatedAt != null &&
        current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      )
        throw changed("advance", "ADVANCE_CHANGED");
      const count = await store.billsRecovering(tx, ws, id);
      if (count > 0)
        throw conflict(
          "ADVANCE_RECOVERED",
          `${String(count)} ${count === 1 ? "bill recovers" : "bills recover"} this advance. Remove the recoveries (reverse or delete those bills) first.`,
          { count },
        );
      const secured = await store.guaranteesOfAdvance(tx, ws, id);
      if (secured > 0)
        throw conflict(
          "ADVANCE_HAS_GUARANTEE",
          "A bank guarantee secures this advance. Delete the guarantee first.",
          { count: secured },
        );
      if (current.paymentId != null)
        await payments.cancel(tx, access, current.paymentId);
      await store.deleteAdvance(tx, id, access.userId, at);
      await this.audit(tx, access, "advance.deleted", "advance", id, at, {
        before: advanceSnapshot(current, null),
      });
      return this.read(access, contract, tx);
    });
  }

  // Bank guarantees -----------------------------------------------------------

  private async checkGuaranteeAdvance(
    tx: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    advanceId: string | null,
  ): Promise<void> {
    if (advanceId == null) return;
    const advance = await this.deps.store.findAdvance(
      tx,
      workspaceId,
      advanceId,
    );
    const own =
      advance?.projectId === contract.projectId &&
      (contract.side === "contractor"
        ? advance.workOrderId === contract.workOrderId
        : advance.direction === "received");
    if (!own)
      throw new DomainError(
        "GUARANTEE_ADVANCE_INVALID",
        "Pick an advance of this contract.",
        { details: { field: "advanceId" } },
      );
  }

  /** Adds a bank guarantee to the contract (Update + Financial). */
  async addGuarantee(
    access: MemberAccess,
    input: ContractInput & GuaranteeInput,
  ): Promise<AdvancesAndRetention> {
    const contract = this.contractOf(input);
    this.assertFlag(access, contract, "update");
    this.assertFinancial(access, contract);
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, contract.projectId);
    const today = await this.deps.today(ws);
    const fields = guaranteeFields(input, { today });
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const { workOrder } = await this.terms(tx, ws, contract);
      this.assertWorkOrderLive(workOrder);
      await this.checkGuaranteeAdvance(tx, ws, contract, fields.advanceId);
      const row: StoredGuarantee = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId: contract.projectId,
        side: contract.side,
        workOrderId: workOrder?.id ?? null,
        ...fields,
        releasedOn: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insertGuarantee(tx, row);
      await this.audit(
        tx,
        access,
        "bank_guarantee.added",
        "bank_guarantee",
        row.id,
        at,
        { after: guaranteeSnapshot(row) },
      );
      return this.read(access, contract, tx);
    });
  }

  private async lockedGuarantee(
    tx: ContractsTx,
    workspaceId: string,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredGuarantee> {
    const current = await this.deps.store.findGuarantee(tx, workspaceId, id);
    if (current == null) throw guaranteeNotFound();
    if (
      expectedUpdatedAt != null &&
      current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    )
      throw changed("bank guarantee", "GUARANTEE_CHANGED");
    return current;
  }

  private assertNotReleased(guarantee: StoredGuarantee): void {
    if (guarantee.releasedOn != null)
      throw conflict(
        "GUARANTEE_RELEASED",
        `This guarantee was released on ${guarantee.releasedOn}, so it is no longer changed.`,
      );
  }

  /** Edits a guarantee until it is released (Update + Financial; 409 `GUARANTEE_RELEASED`). */
  async updateGuarantee(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: GuaranteeInput,
  ): Promise<AdvancesAndRetention> {
    const before = await this.findGuarantee(access.workspaceId, id);
    const contract = this.contractOfRecord(before);
    this.assertFlag(access, contract, "update");
    this.assertFinancial(access, contract);
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const fields = guaranteeFields(input, { today });
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const current = await this.lockedGuarantee(tx, ws, id, expectedUpdatedAt);
      this.assertNotReleased(current);
      await this.checkGuaranteeAdvance(tx, ws, contract, fields.advanceId);
      if (
        current.purpose === "retention" &&
        fields.purpose !== "retention" &&
        (await store.releasesAgainst(tx, ws, id)) > 0
      )
        throw conflict(
          "GUARANTEE_IN_USE",
          "Retention was released against this guarantee, so it stays a retention guarantee.",
        );
      const after: StoredGuarantee = {
        ...current,
        ...fields,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.updateGuarantee(tx, after, current.updatedAt)))
        throw changed("bank guarantee", "GUARANTEE_CHANGED");
      await this.audit(
        tx,
        access,
        "bank_guarantee.updated",
        "bank_guarantee",
        id,
        at,
        { before: guaranteeSnapshot(current), after: guaranteeSnapshot(after) },
      );
      return this.read(access, contract, tx);
    });
  }

  /** Marks a guarantee released (returned to the bank) on a date (Update). */
  async releaseGuarantee(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
    releasedOn: string,
  ): Promise<AdvancesAndRetention> {
    const before = await this.findGuarantee(access.workspaceId, id);
    const contract = this.contractOfRecord(before);
    this.assertFlag(access, contract, "update");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const current = await this.lockedGuarantee(tx, ws, id, expectedUpdatedAt);
      this.assertNotReleased(current);
      const date = guaranteeReleaseDate(releasedOn, {
        issuedOn: current.issuedOn,
        today,
      });
      const after: StoredGuarantee = {
        ...current,
        releasedOn: date,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.updateGuarantee(tx, after, current.updatedAt)))
        throw changed("bank guarantee", "GUARANTEE_CHANGED");
      await this.audit(
        tx,
        access,
        "bank_guarantee.released",
        "bank_guarantee",
        id,
        at,
        { before: guaranteeSnapshot(current), after: guaranteeSnapshot(after) },
      );
      return this.read(access, contract, tx);
    });
  }

  /** Deletes a guarantee (Delete): not one retention was released against (409 `GUARANTEE_IN_USE`). */
  async deleteGuarantee(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<AdvancesAndRetention> {
    const before = await this.findGuarantee(access.workspaceId, id);
    const contract = this.contractOfRecord(before);
    this.assertFlag(access, contract, "delete");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const current = await this.lockedGuarantee(tx, ws, id, expectedUpdatedAt);
      const used = await store.releasesAgainst(tx, ws, id);
      if (used > 0)
        throw conflict(
          "GUARANTEE_IN_USE",
          "Retention was released against this guarantee. Delete that release first.",
          { count: used },
        );
      await store.deleteGuarantee(tx, id, access.userId, at);
      await this.audit(
        tx,
        access,
        "bank_guarantee.deleted",
        "bank_guarantee",
        id,
        at,
        { before: guaranteeSnapshot(current) },
      );
      return this.read(access, contract, tx);
    });
  }

  // Retention release ---------------------------------------------------------

  /**
   * Releases retention (Update + Financial): at completion, at the end of
   * the DLP (earlier only with Approve and a reason), against a live
   * retention bank guarantee of the contract, or for another reason, up to
   * what is releasable. A finance invoice is created for the amount in the
   * same transaction: payable to the Contractor (Work Order) or receivable
   * from the Client (client contract), origin `retention_release`.
   */
  async release(
    access: MemberAccess,
    input: ContractInput & ReleaseInput,
  ): Promise<AdvancesAndRetention> {
    const contract = this.contractOf(input);
    this.assertFlag(access, contract, "update");
    this.assertFinancial(access, contract);
    const { db, store, boq, invoicing } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(db, ws, contract.projectId);
    const today = await this.deps.today(ws);
    const canReleaseEarly = can(access, menuOfSide(contract.side), "approve", {
      projectId: contract.projectId,
    });
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const terms = await this.terms(tx, ws, contract);
      const { workOrder } = terms;
      this.assertWorkOrderLive(workOrder);
      const clientId = workOrder == null ? this.clientOf(project) : null;
      const [deducted, releases, count] = await Promise.all([
        store.retentionDeducted(tx, ws, contract),
        store.releases(tx, ws, contract),
        store.releaseCount(tx, ws, contract),
      ]);
      const position = retentionPosition({
        deducted,
        released: releases.reduce((sum, row) => sum + row.amount, 0n),
        completionPercent: terms.completionPercent,
      });
      const fields = releaseFields(input, {
        today,
        releasable: position.releasable,
        dlp: dlpPeriod(terms.startsOn, terms.dlpMonths, today),
        canReleaseEarly,
      });
      if (fields.bankGuaranteeId != null) {
        const guarantee = await store.findGuarantee(
          tx,
          ws,
          fields.bankGuaranteeId,
        );
        const own =
          guarantee?.projectId === contract.projectId &&
          guarantee.side === contract.side &&
          (contract.side === "client" ||
            guarantee.workOrderId === contract.workOrderId);
        if (
          !own ||
          guarantee.purpose !== "retention" ||
          guaranteeStatus(guarantee, fields.releasedOn) !== "live"
        )
          throw new DomainError(
            "RELEASE_GUARANTEE_INVALID",
            "Pick a retention bank guarantee of this contract that is live on the release date.",
            { details: { field: "bankGuaranteeId" } },
          );
      }
      const id = newId(at.getTime());
      const where =
        workOrder == null
          ? "the client contract"
          : `Work Order ${workOrder.number ?? ""}`.trim();
      const invoice = await invoicing.createRelease(tx, {
        workspaceId: ws,
        by: access.userId,
        partyType: workOrder == null ? "client" : "contractor",
        partyId: workOrder?.contractorId ?? clientId ?? "",
        projectId: contract.projectId,
        departmentId: workOrder?.departmentId ?? null,
        number:
          workOrder == null
            ? `RET-${String(count + 1)}`
            : `${workOrder.number ?? "WO"}/RET-${String(count + 1)}`,
        date: fields.releasedOn,
        amount: fields.amount,
        sourceId: id,
        remarks: `Retention released on ${where} (${RETENTION_STAGE_LABELS[fields.stage].toLowerCase()})${fields.reason == null ? "" : `: ${fields.reason}`}`,
      });
      const row: StoredRelease = {
        id,
        workspaceId: ws,
        projectId: contract.projectId,
        side: contract.side,
        workOrderId: workOrder?.id ?? null,
        clientId,
        stage: fields.stage,
        amount: fields.amount,
        releasedOn: fields.releasedOn,
        reason: fields.reason,
        bankGuaranteeId: fields.bankGuaranteeId,
        invoiceId: invoice.id,
        createdAt: at,
        createdBy: access.userId,
      };
      await store.insertRelease(tx, row);
      await this.audit(
        tx,
        access,
        "retention.released",
        "retention_release",
        id,
        at,
        {
          after: {
            ...releaseSnapshot(row),
            invoiceNumber: invoice.number,
            beforeDlpEnd: fields.beforeDlpEnd,
          },
        },
      );
      return this.read(access, contract, tx);
    });
  }

  /**
   * Deletes a release with a reason (Delete; 400 `DELETE_REASON_REQUIRED`)
   * while its invoice is unsettled (409 `RELEASE_SETTLED`): the invoice is
   * removed in finance and the retention is held (receivable) again.
   */
  async deleteRelease(
    access: MemberAccess,
    id: string,
    rawReason: string,
  ): Promise<AdvancesAndRetention> {
    const before = await this.findRelease(access.workspaceId, id);
    const contract = this.contractOfRecord(before);
    this.assertFlag(access, contract, "delete");
    const reason = releaseDeleteReason(rawReason);
    const { db, store, boq, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const current = await store.findRelease(tx, ws, id);
      if (current == null) throw releaseNotFound();
      if (current.invoiceId != null) {
        if (
          await invoicing.isSettled(tx, {
            workspaceId: ws,
            invoiceId: current.invoiceId,
          })
        )
          throw conflict(
            "RELEASE_SETTLED",
            current.side === "contractor"
              ? "The release's invoice is paid (or written off) in finance, so the release cannot be deleted."
              : "Money is received (or written off) against the release's invoice, so the release cannot be deleted.",
          );
        await invoicing.reverse(tx, {
          workspaceId: ws,
          by: access.userId,
          invoiceId: current.invoiceId,
          reason,
        });
      }
      await store.deleteRelease(tx, id, access.userId, at);
      await this.audit(
        tx,
        access,
        "retention_release.deleted",
        "retention_release",
        id,
        at,
        { before: releaseSnapshot(current), after: { reason } },
      );
      return this.read(access, contract, tx);
    });
  }

  // DLP -------------------------------------------------------------------------

  /**
   * Records a Work Order's completion date, where its DLP starts (Work
   * Order Update; an issued or closed Work Order). Closing a Work Order or
   * approving its Final bill sets it when none was recorded (CM-1104,
   * CM-1106); this edits it. 409 `WORK_ORDER_CHANGED` when stale.
   */
  async setCompletion(
    access: MemberAccess,
    workOrderId: string,
    expectedUpdatedAt: Date | null,
    completedOn: string,
  ): Promise<AdvancesAndRetention> {
    const { db, boq, workOrders } = this.deps;
    const ws = access.workspaceId;
    const found = await workOrders.find(db, ws, workOrderId);
    if (found == null) throw workOrderNotFound();
    const contract: ContractRef = {
      side: "contractor",
      projectId: found.projectId,
      workOrderId,
    };
    this.assertFlag(access, contract, "update");
    const today = await this.deps.today(ws);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, found.projectId);
      const current = await workOrders.find(tx, ws, workOrderId);
      if (current == null) throw workOrderNotFound();
      if (current.status !== "issued" && current.status !== "closed")
        throw conflict(
          "WORK_ORDER_STATUS_INVALID",
          "The completion date is recorded on an issued or closed Work Order.",
          { status: current.status, action: "complete" },
        );
      if (
        expectedUpdatedAt != null &&
        current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      )
        throw changed("Work Order", "WORK_ORDER_CHANGED");
      const date = completionDate(completedOn, {
        orderDate: current.orderDate,
        today,
      });
      const after: StoredWorkOrder = {
        ...current,
        completedOn: date,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await workOrders.update(tx, after, current.updatedAt)))
        throw changed("Work Order", "WORK_ORDER_CHANGED");
      await this.audit(
        tx,
        access,
        "work_order.completion_recorded",
        "work_order",
        workOrderId,
        at,
        {
          before: { completedOn: current.completedOn },
          after: { completedOn: date },
        },
      );
      return this.read(access, contract, tx);
    });
  }
}

function advanceSnapshot(row: StoredAdvance, paymentNumber: string | null) {
  return {
    direction: row.direction,
    kind: row.kind,
    workOrderId: row.workOrderId,
    clientId: row.clientId,
    amount: Number(row.amount),
    advanceOn: row.advanceOn,
    recoveryMode: row.recoveryMode,
    recoveryValue: Number(row.recoveryValue),
    paymentId: row.paymentId,
    ...(paymentNumber == null ? {} : { paymentNumber }),
    remarks: row.remarks,
  };
}

function guaranteeSnapshot(row: StoredGuarantee) {
  return {
    side: row.side,
    purpose: row.purpose,
    workOrderId: row.workOrderId,
    advanceId: row.advanceId,
    number: row.number,
    bank: row.bank,
    amount: Number(row.amount),
    issuedOn: row.issuedOn,
    expiresOn: row.expiresOn,
    releasedOn: row.releasedOn,
  };
}

function releaseSnapshot(row: StoredRelease) {
  return {
    side: row.side,
    workOrderId: row.workOrderId,
    clientId: row.clientId,
    stage: row.stage,
    amount: Number(row.amount),
    releasedOn: row.releasedOn,
    reason: row.reason,
    bankGuaranteeId: row.bankGuaranteeId,
    invoiceId: row.invoiceId,
  };
}
