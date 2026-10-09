import type { AuditEvent } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import {
  companyFileKey,
  fileVersion,
  type NewStoredFile,
  type ObjectStorage,
  type StoredObject,
} from "@/src/shared-kernel/files";
import { checkDocument } from "@/src/shared-kernel/files/document-file";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { PartyType } from "../domain/ledger";
import {
  wagePayment,
  type PaymentKind,
  type PaymentMode,
  type WagePayment,
} from "../domain/wage-payment";
import type { ProjectDirectory, TeamMemberDirectory } from "./directories";

/** A recorded wage payment as stored (live or cancelled). */
export type StoredWagePayment = WagePayment & {
  id: string;
  workspaceId: string;
  /** Storage key of the receipt; a `stored_files` row. */
  documentKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** A labourer or vendor a payment can be made to. */
export type PaymentParty = {
  id: string;
  name: string;
  /** Labour: the current Project. Vendor: the Projects it is assigned to. */
  projectIds: readonly string[];
};

export type WagePaymentListParams = {
  workspaceId: string;
  projectId: string;
  /** The party types the caller may read; never empty. */
  partyTypes: readonly PartyType[];
  partyId?: string;
  from?: CalendarDate;
  to?: CalendarDate;
  kind?: PaymentKind;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type WagePaymentListPage = {
  items: StoredWagePayment[];
  total: number;
  hasMore: boolean;
  /** Paise: the sum of every payment matching the filters (all pages). */
  totalAmount: number;
};

/**
 * Where wage payments live (Prisma in infrastructure). `insert` and
 * `cancel` write the payment row, its ledger entries and the audit event
 * in one transaction (ADR CM-0004).
 */
export type WagePaymentStore = {
  /** A live (not cancelled) payment. */
  find(workspaceId: string, id: string): Promise<StoredWagePayment | null>;
  /** Live payments of a Project, newest recorded first (root ADR-0020). */
  list(params: WagePaymentListParams): Promise<WagePaymentListPage>;
  /** A live labourer or vendor of the Company, or null. */
  party(
    workspaceId: string,
    partyType: PartyType,
    partyId: string,
  ): Promise<PaymentParty | null>;
  /** Names by id, including inactive and deleted parties. */
  partyNames(
    workspaceId: string,
    partyType: PartyType,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  /**
   * The payment row, its negative ledger entry and the audit event, after
   * locking the party's row (404 `LABOUR_NOT_FOUND` / `VENDOR_NOT_FOUND`
   * when it was deleted meanwhile).
   */
  insert(payment: StoredWagePayment): Promise<void>;
  /**
   * Tombstones the payment (compare-and-set on `updatedAt`, else 409
   * `PAYMENT_CHANGED`; 404 when already cancelled) and reverses its ledger
   * entry.
   */
  cancel(input: {
    payment: StoredWagePayment;
    expectedUpdatedAt: Date;
    by: string;
    now: Date;
  }): Promise<void>;
  /**
   * Sets `document_key` from `loadedKey` to `key` (compare-and-set, else
   * 409 `RECEIPT_CHANGED`), records the stored file and the audit event.
   */
  setReceipt(input: {
    payment: StoredWagePayment;
    loadedKey: string | null;
    key: string | null;
    added: NewStoredFile | null;
    removedKey: string | null;
    now: Date;
    audit: AuditEvent;
  }): Promise<void>;
  /** Active Team Members by name, for "Paid by". */
  payers(workspaceId: string): Promise<{ id: string; name: string }[]>;
  /** The caller's own Team Member id, for the "Paid by" default. */
  memberIdOf(workspaceId: string, userId: string): Promise<string | null>;
  /** Today in the Company's time zone. */
  today(workspaceId: string): Promise<CalendarDate>;
};

export type WagePaymentActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

/**
 * The kernel's back-dated entry policy for payments. The catalogue has no
 * `labour_payment` / `vendor_payment` module, so payments use the
 * Company's default limits (what every Labour & Vendor module uses in
 * global mode) and the Financial Closing Date.
 */
export type WagePaymentBackdatedGuard = {
  assert(
    action: "create" | "edit",
    actor: WagePaymentActor,
    partyType: PartyType,
    date: CalendarDate,
  ): Promise<void>;
};

export type WagePaymentReadModel = {
  id: string;
  partyType: PartyType;
  partyId: string;
  partyName: string;
  projectId: string;
  /** Null when the Project was deleted. */
  projectName: string | null;
  paymentDate: CalendarDate;
  kind: PaymentKind;
  mode: PaymentMode;
  reference: string | null;
  /** Paise, > 0. */
  amount: number;
  paidBy: { id: string; name: string } | null;
  remarks: string | null;
  /** The receipt file's id, which versions its URL; null without a receipt. */
  receiptVersion: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecordWagePaymentInput = {
  actor: WagePaymentActor;
  partyType: PartyType;
  partyId: string;
  projectId: string;
  paymentDate: string;
  kind: PaymentKind;
  mode: PaymentMode;
  amount: number;
  reference?: string | null;
  paidByMemberId?: string | null;
  remarks?: string | null;
};

const MB = 1024 * 1024;

/** A receipt is one PDF, PNG, JPEG or WebP of at most 10 MB. */
export const RECEIPT_MAX_BYTES = 10 * MB;

const RECEIPT_FOLDER = "wage-payment-receipts";

export const paymentNotFound = () =>
  notFound("PAYMENT_NOT_FOUND", "This payment was not found.");

const receiptNotFound = () =>
  notFound("RECEIPT_NOT_FOUND", "This payment has no receipt.");

function partyNotFound(partyType: PartyType): DomainError {
  return partyType === "labour"
    ? notFound("LABOUR_NOT_FOUND", "This Labour was not found.")
    : notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
}

/**
 * Wage payments to labourers and vendors (CM-215, `modules/08` "Decisions
 * for the build"). A payment is never edited: cancel it (its ledger entry
 * is reversed) and record it again. Access is checked by the caller.
 */
export class WagePaymentHandlers {
  constructor(
    private readonly store: WagePaymentStore,
    private readonly projects: ProjectDirectory,
    private readonly teamMembers: TeamMemberDirectory,
    private readonly guard: WagePaymentBackdatedGuard,
    private readonly storage: ObjectStorage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const payment = await this.store.find(workspaceId, id);
    if (payment == null) throw paymentNotFound();
    return payment;
  }

  private async readModels(
    workspaceId: string,
    payments: readonly StoredWagePayment[],
  ): Promise<WagePaymentReadModel[]> {
    const ids = (type: PartyType) =>
      payments.filter((item) => item.partyType === type).map((p) => p.partyId);
    const [labours, vendors, projects, members] = await Promise.all([
      this.store.partyNames(workspaceId, "labour", ids("labour")),
      this.store.partyNames(workspaceId, "vendor", ids("vendor")),
      this.projects.find(
        workspaceId,
        payments.map((item) => item.projectId),
      ),
      this.teamMembers.find(
        workspaceId,
        payments.flatMap((item) =>
          item.paidByMemberId == null ? [] : [item.paidByMemberId],
        ),
      ),
    ]);
    return payments.map((payment) => {
      const names = payment.partyType === "labour" ? labours : vendors;
      const member =
        payment.paidByMemberId == null
          ? undefined
          : members.get(payment.paidByMemberId);
      return {
        id: payment.id,
        partyType: payment.partyType,
        partyId: payment.partyId,
        partyName: names.get(payment.partyId) ?? "—",
        projectId: payment.projectId,
        projectName: projects.get(payment.projectId)?.name ?? null,
        paymentDate: payment.paymentDate,
        kind: payment.kind,
        mode: payment.mode,
        reference: payment.reference,
        amount: payment.amount,
        paidBy: member == null ? null : { id: member.id, name: member.name },
        remarks: payment.remarks,
        receiptVersion:
          payment.documentKey == null ? null : fileVersion(payment.documentKey),
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };
    });
  }

  private async readModel(
    payment: StoredWagePayment,
  ): Promise<WagePaymentReadModel> {
    const [model] = await this.readModels(payment.workspaceId, [payment]);
    if (model == null) throw paymentNotFound();
    return model;
  }

  async get(workspaceId: string, id: string): Promise<WagePaymentReadModel> {
    return this.readModel(await this.load(workspaceId, id));
  }

  async list(params: WagePaymentListParams): Promise<{
    items: WagePaymentReadModel[];
    total: number;
    hasMore: boolean;
    totalAmount: number;
  }> {
    const page = await this.store.list(params);
    return {
      items: await this.readModels(params.workspaceId, page.items),
      total: page.total,
      hasMore: page.hasMore,
      totalAmount: page.totalAmount,
    };
  }

  /** Who can be chosen as "Paid by", and the caller's own Team Member. */
  async payers(
    workspaceId: string,
    userId: string,
  ): Promise<{
    items: { id: string; name: string }[];
    currentMemberId: string | null;
  }> {
    const [items, currentMemberId] = await Promise.all([
      this.store.payers(workspaceId),
      this.store.memberIdOf(workspaceId, userId),
    ]);
    return { items, currentMemberId };
  }

  /**
   * Records a payment or an advance: the party must be live in the
   * Company, the Project live, a vendor assigned to the Project, "Paid by"
   * a live Team Member, the date not in the future and inside the
   * back-dated limits. Inactive parties can still be paid (settling a
   * labourer who left). Writes the payment, its ledger entry and the audit
   * event in one transaction.
   */
  async record(input: RecordWagePaymentInput): Promise<WagePaymentReadModel> {
    const { actor } = input;
    const workspaceId = actor.workspaceId;
    const paymentDate = assertCalendarDate(
      input.paymentDate,
      "PAYMENT_DATE_INVALID",
    );
    const payment = wagePayment({
      partyType: input.partyType,
      partyId: input.partyId,
      projectId: input.projectId,
      paymentDate,
      kind: input.kind,
      mode: input.mode,
      amount: input.amount,
      reference: input.reference,
      paidByMemberId: input.paidByMemberId,
      remarks: input.remarks,
    });
    const [projects, party, today] = await Promise.all([
      this.projects.find(workspaceId, [payment.projectId]),
      this.store.party(workspaceId, payment.partyType, payment.partyId),
      this.store.today(workspaceId),
    ]);
    if (!projects.has(payment.projectId))
      throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
    if (party == null) throw partyNotFound(payment.partyType);
    if (
      payment.partyType === "vendor" &&
      !party.projectIds.includes(payment.projectId)
    )
      throw new DomainError(
        "VENDOR_NOT_ON_PROJECT",
        `${party.name} is not assigned to this Project. Assign them on the Vendor first.`,
      );
    if (payment.paidByMemberId != null) {
      const members = await this.teamMembers.find(workspaceId, [
        payment.paidByMemberId,
      ]);
      if (!members.has(payment.paidByMemberId))
        throw new DomainError(
          "TEAM_MEMBER_NOT_FOUND",
          "The Team Member who paid was not found. Choose again.",
        );
    }
    if (paymentDate > today)
      throw new DomainError(
        "PAYMENT_DATE_IN_FUTURE",
        "The payment date cannot be after today.",
      );
    await this.guard.assert("create", actor, payment.partyType, paymentDate);
    const now = this.clock();
    const stored: StoredWagePayment = {
      ...payment,
      id: newId(now.getTime()),
      workspaceId,
      documentKey: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    };
    await this.store.insert(stored);
    return this.readModel(stored);
  }

  /**
   * Cancels a payment: the row is tombstoned and its ledger entry
   * reversed, so the balance is restored. The back-dated edit limit
   * applies to the payment date.
   */
  async cancel(input: {
    actor: WagePaymentActor;
    id: string;
    expectedUpdatedAt: Date;
  }): Promise<void> {
    const payment = await this.load(input.actor.workspaceId, input.id);
    await this.guard.assert(
      "edit",
      input.actor,
      payment.partyType,
      payment.paymentDate,
    );
    await this.store.cancel({
      payment,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.actor.userId,
      now: this.clock(),
    });
  }

  /** Best effort: a leftover object costs storage, not correctness. */
  private async discard(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      console.error(`Could not delete ${key} from storage`, error);
    }
  }

  private audit(
    payment: StoredWagePayment,
    by: string,
    action: string,
    now: Date,
    extra: Partial<AuditEvent>,
  ): AuditEvent {
    return {
      workspaceId: payment.workspaceId,
      actorUserId: by,
      action: `wage_payment.${action}`,
      entityType: "wage_payment",
      entityId: payment.id,
      occurredAt: now,
      ...extra,
    };
  }

  /** Sets or replaces the payment's one receipt (PDF or image, ≤ 10 MB). */
  async attachReceipt(input: {
    actor: WagePaymentActor;
    id: string;
    bytes: Uint8Array;
    contentType: string | null;
  }): Promise<WagePaymentReadModel> {
    const { workspaceId, userId } = input.actor;
    const payment = await this.load(workspaceId, input.id);
    const checked = checkDocument(
      input.bytes,
      input.contentType,
      RECEIPT_MAX_BYTES,
    );
    const now = this.clock();
    const key = companyFileKey(workspaceId, RECEIPT_FOLDER, checked.extension);
    await this.storage.put(key, input.bytes, checked.contentType);
    try {
      await this.store.setReceipt({
        payment,
        loadedKey: payment.documentKey,
        key,
        added: {
          workspaceId,
          key,
          kind: "wage_payment_receipt",
          contentType: checked.contentType,
          bytes: checked.bytes,
          createdBy: userId,
          createdAt: now,
        },
        removedKey: payment.documentKey,
        now,
        audit: this.audit(payment, userId, "receipt_changed", now, {
          before: { documentKey: payment.documentKey },
          after: { documentKey: key },
        }),
      });
    } catch (error) {
      await this.discard(key);
      throw error;
    }
    if (payment.documentKey != null) await this.discard(payment.documentKey);
    return this.readModel({ ...payment, documentKey: key });
  }

  /** Removing a receipt that is not there is not an error. */
  async removeReceipt(input: {
    actor: WagePaymentActor;
    id: string;
  }): Promise<WagePaymentReadModel> {
    const { workspaceId, userId } = input.actor;
    const payment = await this.load(workspaceId, input.id);
    if (payment.documentKey == null) return this.readModel(payment);
    const now = this.clock();
    await this.store.setReceipt({
      payment,
      loadedKey: payment.documentKey,
      key: null,
      added: null,
      removedKey: payment.documentKey,
      now,
      audit: this.audit(payment, userId, "receipt_removed", now, {
        before: { documentKey: payment.documentKey },
        after: { documentKey: null },
      }),
    });
    await this.discard(payment.documentKey);
    return this.readModel({ ...payment, documentKey: null });
  }

  async receipt(workspaceId: string, id: string): Promise<StoredObject> {
    const payment = await this.load(workspaceId, id);
    if (payment.documentKey == null) throw receiptNotFound();
    const object = await this.storage.get(payment.documentKey);
    if (object == null) throw receiptNotFound();
    return object;
  }
}
