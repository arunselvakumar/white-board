import { todayInIndia } from "../domain/dates";
import { conflict, forbidden, invalid, notFound } from "../domain/errors";
import {
  assertConcession,
  invoiceDuePaise,
  invoiceStatus,
  type InvoiceAmounts,
} from "../domain/fees";
import { assertManagerOf, canReadChild, type PreschoolActor } from "./access";
import type {
  FeeAccountStore,
  FeeChildRecord,
  InvoiceGenerator,
  InvoiceRecord,
} from "./fee-ports";
import type {
  ChildFeeAccountView,
  FeeTotalsView,
  InvoiceView,
} from "./fee-views";

function amounts(invoice: InvoiceRecord): InvoiceAmounts {
  return {
    amountPaise: invoice.amountPaise,
    concessionPaise: invoice.concessionPaise,
    paidPaise: invoice.paidPaise,
    cancelled: invoice.cancelled,
  };
}

export function invoiceView(
  invoice: InvoiceRecord,
  today: string,
): InvoiceView {
  return {
    id: invoice.id,
    admissionId: invoice.admissionId,
    feeHeadId: invoice.feeHeadId,
    feeHeadName: invoice.feeHeadName,
    label: invoice.label,
    dueOn: invoice.dueOn,
    amountPaise: invoice.amountPaise,
    concessionPaise: invoice.concessionPaise,
    concessionReason: invoice.concessionReason,
    paidPaise: invoice.paidPaise,
    duePaise: invoiceDuePaise(amounts(invoice)),
    status: invoiceStatus({ ...amounts(invoice), dueOn: invoice.dueOn }, today),
  };
}

function totals(
  invoices: readonly InvoiceView[],
  today: string,
): FeeTotalsView {
  const live = invoices.filter((invoice) => invoice.status !== "cancelled");
  const sum = (pick: (invoice: InvoiceView) => number) =>
    live.reduce((total, invoice) => total + pick(invoice), 0);
  return {
    billedPaise: sum((invoice) => invoice.amountPaise),
    concessionPaise: sum((invoice) => invoice.concessionPaise),
    paidPaise: sum((invoice) => invoice.paidPaise),
    duePaise: sum((invoice) => invoice.duePaise),
    overduePaise: sum((invoice) =>
      invoice.dueOn < today ? invoice.duePaise : 0,
    ),
  };
}

/**
 * Who may open a Child's fees: managers of the Child's Centre, and the
 * Child's own Parents (read only). Teachers never see fee amounts.
 */
export function assertMayReadChildFees(
  actor: PreschoolActor,
  child: { id: string; centreId: string },
): void {
  if (actor.role === "parent") {
    if (!canReadChild(actor, child))
      throw forbidden(
        "CHILD_FORBIDDEN",
        "You do not have access to this Child.",
      );
    return;
  }
  assertManagerOf(actor, child.centreId);
}

/** A Child's Invoices: reading the account, raising, editing and cancelling. */
export class FeeAccountHandlers {
  constructor(
    private readonly deps: {
      store: FeeAccountStore;
      generator: InvoiceGenerator;
      now: () => Date;
    },
  ) {}

  async account(
    actor: PreschoolActor,
    childId: string,
  ): Promise<ChildFeeAccountView> {
    const record = await this.child(actor.workspaceId, childId);
    assertMayReadChildFees(actor, record);
    return this.read(actor.workspaceId, record);
  }

  /** Raises the active Admission's Invoices from the Fee Structure in force. */
  async generate(
    actor: PreschoolActor,
    childId: string,
  ): Promise<ChildFeeAccountView> {
    const record = await this.child(actor.workspaceId, childId);
    assertManagerOf(actor, record.centreId);
    const admissionId = this.activeAdmission(record);
    const result = await this.deps.generator.generate(admissionId);
    if (result === "already_invoiced")
      throw conflict(
        "INVOICES_EXIST",
        "This Admission already has Invoices. Add or edit Invoices instead.",
      );
    if (result === "no_structure")
      throw conflict(
        "FEE_STRUCTURE_MISSING",
        "There is no Fee Structure for this Child's Programme and Academic Year.",
      );
    return this.read(actor.workspaceId, record);
  }

  async createInvoice(
    actor: PreschoolActor,
    input: {
      childId: string;
      feeHeadId: string;
      label: string;
      dueOn: string;
      amountPaise: number;
    },
  ): Promise<InvoiceView> {
    const { store } = this.deps;
    const record = await this.child(actor.workspaceId, input.childId);
    assertManagerOf(actor, record.centreId);
    const admissionId = this.activeAdmission(record);
    const head = await store.feeHead(actor.workspaceId, input.feeHeadId);
    if (head == null)
      throw notFound("FEE_HEAD_NOT_FOUND", "Fee Head not found.");
    if (head.isArchived)
      throw conflict("FEE_HEAD_ARCHIVED", `${head.name} is archived.`);
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0)
      throw invalid("FEE_AMOUNT_INVALID", "Enter an amount above ₹0.");
    const id = await store.createInvoice(actor.workspaceId, {
      centreId: record.centreId,
      childId: record.id,
      admissionId,
      feeHeadId: head.id,
      label: invoiceLabel(input.label),
      dueOn: input.dueOn,
      amountPaise: input.amountPaise,
    });
    return this.invoiceView(actor.workspaceId, id);
  }

  async updateInvoice(
    actor: PreschoolActor,
    id: string,
    input: { label: string; dueOn: string; amountPaise: number },
  ): Promise<InvoiceView> {
    await this.findManaged(actor, id);
    const label = invoiceLabel(input.label);
    const invoice = await this.deps.store.changeInvoice(
      actor.workspaceId,
      id,
      (current) => {
        assertNotCancelled(current);
        if (
          !Number.isInteger(input.amountPaise) ||
          input.amountPaise < current.paidPaise + current.concessionPaise
        )
          throw conflict(
            "INVOICE_AMOUNT_BELOW_PAID",
            "The amount cannot be less than what is already paid plus the concession.",
            {
              minimumPaise: current.paidPaise + current.concessionPaise,
            },
          );
        return { label, dueOn: input.dueOn, amountPaise: input.amountPaise };
      },
    );
    return invoiceView(invoice, this.today());
  }

  async giveConcession(
    actor: PreschoolActor,
    id: string,
    input: { concessionPaise: number; reason: string | null },
  ): Promise<InvoiceView> {
    await this.findManaged(actor, id);
    const reason = input.reason?.trim() ?? "";
    if (input.concessionPaise > 0 && reason === "")
      throw invalid(
        "CONCESSION_REASON_REQUIRED",
        "Say why the concession is given, such as sibling or staff ward.",
      );
    const invoice = await this.deps.store.changeInvoice(
      actor.workspaceId,
      id,
      (current) => {
        assertNotCancelled(current);
        assertConcession(current, input.concessionPaise);
        return {
          concessionPaise: input.concessionPaise,
          concessionReason: input.concessionPaise === 0 ? null : reason,
        };
      },
    );
    return invoiceView(invoice, this.today());
  }

  async cancelInvoice(actor: PreschoolActor, id: string): Promise<InvoiceView> {
    const existing = await this.findManaged(actor, id);
    if (existing.cancelled) return invoiceView(existing, this.today());
    const invoice = await this.deps.store.changeInvoice(
      actor.workspaceId,
      id,
      (current) => {
        if (current.paidPaise > 0)
          throw conflict(
            "INVOICE_PAID",
            "Money has been received against this Invoice, so it cannot be cancelled.",
          );
        return current.cancelled ? {} : { cancelledAt: this.deps.now() };
      },
    );
    return invoiceView(invoice, this.today());
  }

  private async read(
    workspaceId: string,
    record: FeeChildRecord,
  ): Promise<ChildFeeAccountView> {
    const today = this.today();
    const [invoices, payments] = await Promise.all([
      this.deps.store.invoices(
        workspaceId,
        record.id,
        record.activeAdmissionId,
      ),
      this.deps.store.payments(workspaceId, record.id),
    ]);
    const views = invoices.map((invoice) => invoiceView(invoice, today));
    const { activeAdmissionId: _admission, ...child } = record;
    return { child, invoices: views, payments, totals: totals(views, today) };
  }

  private async invoiceView(
    workspaceId: string,
    id: string,
  ): Promise<InvoiceView> {
    const invoice = await this.deps.store.invoice(workspaceId, id);
    if (invoice == null)
      throw notFound("INVOICE_NOT_FOUND", "Invoice not found.");
    return invoiceView(invoice, this.today());
  }

  private async findManaged(
    actor: PreschoolActor,
    id: string,
  ): Promise<InvoiceRecord> {
    const invoice = await this.deps.store.invoice(actor.workspaceId, id);
    if (invoice == null)
      throw notFound("INVOICE_NOT_FOUND", "Invoice not found.");
    assertManagerOf(actor, invoice.centreId);
    return invoice;
  }

  private async child(
    workspaceId: string,
    id: string,
  ): Promise<FeeChildRecord> {
    const child = await this.deps.store.child(workspaceId, id);
    if (child == null) throw notFound("CHILD_NOT_FOUND", "Child not found.");
    return child;
  }

  private activeAdmission(record: FeeChildRecord): string {
    if (record.activeAdmissionId == null)
      throw conflict(
        "CHILD_NOT_ADMITTED",
        `${record.firstName} has no active Admission.`,
      );
    return record.activeAdmissionId;
  }

  private today(): string {
    return todayInIndia(this.deps.now());
  }
}

function assertNotCancelled(invoice: InvoiceRecord): void {
  if (invoice.cancelled)
    throw conflict("INVOICE_CANCELLED", "This Invoice is cancelled.");
}

function invoiceLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, " ");
  if (trimmed === "")
    throw invalid("INVOICE_LABEL_REQUIRED", "Enter what the Invoice is for.");
  if (trimmed.length > 200)
    throw invalid(
      "INVOICE_LABEL_TOO_LONG",
      "An Invoice label can be at most 200 characters.",
    );
  return trimmed;
}
