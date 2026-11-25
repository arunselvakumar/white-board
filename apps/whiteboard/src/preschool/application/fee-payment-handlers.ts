import { todayInIndia } from "../domain/dates";
import { invalid, notFound } from "../domain/errors";
import { rupeesInWords } from "../domain/fee-amount-words";
import { allocatePayment } from "../domain/fees";
import { assertManagerOf, type PreschoolActor } from "./access";
import { assertMayReadChildFees } from "./fee-account-handlers";
import type {
  FeeAccountStore,
  FeePaymentStore,
  FeeStructureStore,
} from "./fee-ports";
import type {
  FeePaymentListView,
  FeePaymentMethod,
  ReceiptView,
} from "./fee-views";

export type RecordFeePaymentInput = {
  childId: string;
  amountPaise: number;
  method: FeePaymentMethod;
  /** Defaults to today in India; never in the future. */
  receivedOn?: string;
  reference?: string | null;
  note?: string | null;
  /** Allocate only across these Invoices; oldest first either way. */
  invoiceIds?: readonly string[];
};

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** Fee Payments and Receipts. */
export class FeePaymentHandlers {
  constructor(
    private readonly deps: {
      payments: FeePaymentStore;
      accounts: FeeAccountStore;
      structures: FeeStructureStore;
      now: () => Date;
    },
  ) {}

  /** Records a payment and returns its Receipt. */
  async record(
    actor: PreschoolActor,
    input: RecordFeePaymentInput,
  ): Promise<ReceiptView> {
    const child = await this.deps.accounts.child(
      actor.workspaceId,
      input.childId,
    );
    if (child == null) throw notFound("CHILD_NOT_FOUND", "Child not found.");
    assertManagerOf(actor, child.centreId);
    const today = todayInIndia(this.deps.now());
    const receivedOn = input.receivedOn ?? today;
    if (receivedOn > today)
      throw invalid(
        "FEE_PAYMENT_DATE_IN_FUTURE",
        "The date received cannot be in the future.",
      );
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0)
      throw invalid("FEE_PAYMENT_AMOUNT_INVALID", "Enter an amount above ₹0.");
    const year =
      child.academicYear ??
      (await this.deps.structures.academicYear(actor.workspaceId));
    if (year == null)
      throw notFound("ACADEMIC_YEAR_NOT_FOUND", "Academic Year not found.");
    const amountPaise = input.amountPaise;
    const id = await this.deps.payments.record(actor.workspaceId, {
      centreId: child.centreId,
      childId: child.id,
      academicYearName: year.name,
      amountPaise,
      method: input.method,
      receivedOn,
      reference: blankToNull(input.reference),
      note: blankToNull(input.note),
      recordedByUserId: actor.userId,
      recordedByName: actor.userName,
      invoiceIds:
        input.invoiceIds == null ? null : [...new Set(input.invoiceIds)],
      allocate: (invoices) => allocatePayment(amountPaise, invoices),
    });
    return this.read(actor.workspaceId, id);
  }

  async list(
    actor: PreschoolActor,
    query: {
      centreId: string;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<FeePaymentListView> {
    assertManagerOf(actor, query.centreId);
    if (query.from != null && query.to != null && query.from > query.to)
      throw invalid("DATE_RANGE_INVALID", "`from` must not be after `to`.");
    return this.deps.payments.list(actor.workspaceId, {
      centreId: query.centreId,
      from: query.from ?? null,
      to: query.to ?? null,
      limit: query.limit ?? 50,
      cursor: query.cursor ?? null,
    });
  }

  /** The Receipt. A Parent may read their own Child's. */
  async receipt(actor: PreschoolActor, id: string): Promise<ReceiptView> {
    const owner = await this.deps.payments.owner(actor.workspaceId, id);
    if (owner == null)
      throw notFound("FEE_PAYMENT_NOT_FOUND", "Fee Payment not found.");
    assertMayReadChildFees(actor, {
      id: owner.childId,
      centreId: owner.centreId,
    });
    return this.read(actor.workspaceId, id);
  }

  private async read(workspaceId: string, id: string): Promise<ReceiptView> {
    const receipt = await this.deps.payments.receipt(workspaceId, id);
    if (receipt == null)
      throw notFound("FEE_PAYMENT_NOT_FOUND", "Fee Payment not found.");
    return { ...receipt, amountInWords: rupeesInWords(receipt.amountPaise) };
  }
}
