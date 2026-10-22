import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { approve, reject, pendingState } from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { quantityText } from "../domain/boq";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import {
  TDS_NATURE_LABELS,
  TDS_NATURES,
  WORK_ORDER_GST_RATES,
  WORK_ORDER_SAC_PRESETS,
  type TdsNature,
  type WorkOrderLineKind,
  type WorkOrderStatus,
} from "../domain/contract-terms";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import {
  assertBilledLinesKept,
  assertLineCount,
  assertMaterialsDistinct,
  assertWorkOrderAction,
  closedOnBeforeOrderDate,
  defaultTdsNature,
  overRemaining,
  remainingQuantity,
  resolvedCoefficients,
  workOrderBillOpen,
  workOrderBilled,
  workOrderBoqItemInvalid,
  workOrderChanged,
  workOrderContractorFixed,
  workOrderContractorInvalid,
  workOrderDepartmentInvalid,
  workOrderHeader,
  workOrderLine,
  workOrderLineAmount,
  workOrderLineNotFound,
  workOrderLineUomInvalid,
  workOrderMaterial,
  workOrderMaterialInvalid,
  workOrderNotFound,
  workOrderNotPending,
  workOrderReason,
  workOrderTerms,
  workOrderValue,
  WORK_ORDER_NAMING,
  type OverRemaining,
  type WorkOrderMaterialInput,
  type WorkOrderTerms,
  type WorkOrderTermsInput,
} from "../domain/work-order";
import type { WorkOrderIssued } from "../domain/work-order-events";
import type { StoredBoqItem } from "./boq-ports";
import type {
  ContractsContractorFacts,
  ContractsMaterialFacts,
  ContractsProjectFacts,
  ContractsTx,
  ContractsUomFacts,
} from "./ports";
import {
  WORK_ORDER_DOCUMENT_TYPE,
  WORK_ORDER_MENU,
  type StoredWorkOrder,
  type StoredWorkOrderLine,
  type StoredWorkOrderMaterial,
  type StoredWorkOrderRevision,
  type WorkOrderCursor,
  type WorkOrderDeps,
  type WorkOrderSnapshot,
} from "./work-order-ports";

export { WORK_ORDER_DOCUMENT_TYPE, WORK_ORDER_MENU } from "./work-order-ports";

/** At most this many Materials in the materials picker at a time. */
export const WORK_ORDER_MATERIAL_OPTIONS_MAX = 25;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** A line as the form sends it. `id` keeps an existing line (its kind and BOQ item stay). */
export type WorkOrderLineCommand = {
  id?: string | null;
  kind: WorkOrderLineKind;
  boqItemId?: string | null;
  /** Left out: the BOQ item's. */
  itemNo?: string | null;
  /** Blank: the BOQ item's. */
  description?: string | null;
  /** Blank: the BOQ item's. */
  uomId?: string | null;
  /** Left out: the BOQ item's. */
  sacHsn?: string | null;
  /** Left out on a new BOQ line: what the BOQ has left. */
  quantity?: string | number | null;
  /** Paise per UoM; ignored without Financial. Left out on a BOQ line: the BOQ's current rate. */
  rate?: number | null;
};

export type WorkOrderCommand = {
  contractorId: string;
  departmentId?: string | null;
  orderDate: string;
  validUntil?: string | null;
  scope?: string | null;
  terms?: WorkOrderTermsInput;
  lines: readonly WorkOrderLineCommand[];
  /** Left out on an edit: the materials stay (coefficients of removed lines go). */
  materials?: readonly WorkOrderMaterialInput[];
};

// ---------------------------------------------------------------------------
// What screens read
// ---------------------------------------------------------------------------

export type WorkOrderView = StoredWorkOrder & {
  contractorName: string;
  departmentName: string | null;
  /** Paise. */
  value: bigint;
  lineCount: number;
};

export type WorkOrderLineView = StoredWorkOrderLine & {
  uomName: string;
  /** Paise. */
  amount: bigint;
  /** Ten-thousandths on approved bills; 0 when none. */
  billed: bigint;
  /** BOQ lines: what the BOQ has left after other Work Orders. */
  remaining: bigint | null;
};

export type WorkOrderMaterialView = StoredWorkOrderMaterial & {
  materialName: string;
  uomName: string;
};

export type WorkOrderRevisionView = StoredWorkOrderRevision & {
  createdByName: string | null;
};

export type WorkOrderDetail = {
  workOrder: WorkOrderView;
  projectName: string;
  lines: WorkOrderLineView[];
  materials: WorkOrderMaterialView[];
  revisions: WorkOrderRevisionView[];
  warnings: OverRemaining[];
  createdByName: string | null;
  decidedByName: string | null;
  financial: boolean;
  viewerFlags: Flag[];
};

export type WorkOrderSaved = {
  workOrder: StoredWorkOrder;
  warnings: OverRemaining[];
};

export type WorkOrderListParams = {
  status?: WorkOrderStatus;
  contractorId?: string;
  search?: string;
  limit: number;
  after?: WorkOrderCursor;
  before?: WorkOrderCursor;
};

export type WorkOrderFormOptions = {
  contractors: (ContractsContractorFacts & {
    defaultTdsNature: TdsNature | null;
  })[];
  uoms: ContractsUomFacts[];
  tdsNatures: { key: TdsNature; label: string }[];
  sacPresets: { code: string; label: string }[];
  gstRates: string[];
  financial: boolean;
};

export type WorkOrderBoqItemOption = StoredBoqItem & {
  sectionTitle: string;
  uomName: string;
  /** Ten-thousandths: current quantity less other Work Orders' lines. */
  remaining: bigint;
  /** Ten-thousandths per unit by Material, from the library Item's rate analysis. */
  analysis: { materialId: string; coefficient: bigint }[];
};

/** Everything the PDF prints. */
export type WorkOrderPrint = WorkOrderDetail & {
  project: ContractsProjectFacts;
  contractor: ContractsContractorFacts | null;
};

const unique = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id != null && id !== "")),
];

function blank(raw: string | null | undefined): boolean {
  return raw == null || raw.trim() === "";
}

function usable(facts: { active: boolean } | undefined, kept: boolean) {
  return facts != null && (facts.active || kept);
}

const percent = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

function termsSnapshot(terms: WorkOrderTerms): WorkOrderSnapshot["terms"] {
  return {
    retentionPercent: percent(terms.retentionPercent),
    retentionCapPercent:
      terms.retentionCapPercent == null
        ? null
        : percent(terms.retentionCapPercent),
    retentionCompletionPercent: percent(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths,
    tdsNature: terms.tdsNature,
    sacCode: terms.sacCode,
    gstRate: terms.gstRate == null ? null : percent(terms.gstRate),
    reverseCharge: terms.reverseCharge,
    mobilisationAdvance:
      terms.mobilisationAdvance == null
        ? null
        : Number(terms.mobilisationAdvance),
    mobilisationRecoveryPercent:
      terms.mobilisationRecoveryPercent == null
        ? null
        : percent(terms.mobilisationRecoveryPercent),
  };
}

/** The audit's picture of a Work Order's header (lines are counted, not listed). */
function auditSnapshot(
  workOrder: StoredWorkOrder,
  lines?: readonly StoredWorkOrderLine[],
) {
  return {
    number: workOrder.number,
    status: workOrder.status,
    revision: workOrder.revision,
    contractorId: workOrder.contractorId,
    departmentId: workOrder.departmentId,
    orderDate: workOrder.orderDate,
    validUntil: workOrder.validUntil,
    scope: workOrder.scope,
    terms: termsSnapshot(workOrder.terms),
    ...(lines == null
      ? {}
      : {
          lineCount: lines.length,
          value: Number(workOrderValue(lines)),
        }),
    rejectReason: workOrder.rejectReason,
    closedOn: workOrder.closedOn,
    closeReason: workOrder.closeReason,
    cancelledOn: workOrder.cancelledOn,
    cancelReason: workOrder.cancelReason,
  };
}

type Resolved = {
  contractor: ContractsContractorFacts;
  workOrder: Pick<
    StoredWorkOrder,
    | "contractorId"
    | "departmentId"
    | "orderDate"
    | "validUntil"
    | "scope"
    | "terms"
  >;
  lines: StoredWorkOrderLine[];
  materials: StoredWorkOrderMaterial[];
  warnings: OverRemaining[];
};

type Current = {
  workOrder: StoredWorkOrder;
  lines: StoredWorkOrderLine[];
  materials: StoredWorkOrderMaterial[];
};

/**
 * A Project's Work Orders (CM-1104, ADR CM-0023 §5; menu
 * `contracts.work_orders`, CRUDAJPNOF, Project-level). Every command takes
 * the Project's BOQ lock first. Approve and Reject use the approval kernel
 * and raise `document.*` events (type `work_order`); approval also raises
 * `WorkOrderIssued`.
 */
export class WorkOrderHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: WorkOrderDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredWorkOrder> {
    const found = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (found == null) throw workOrderNotFound();
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

  private async current(
    tx: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<Current> {
    const { store } = this.deps;
    const workOrder = await store.find(tx, workspaceId, id);
    if (workOrder == null) throw workOrderNotFound();
    const [lines, materials] = await Promise.all([
      store.lines(tx, workspaceId, [id]),
      store.materials(tx, workspaceId, id),
    ]);
    return { workOrder, lines, materials };
  }

  viewerFlags(access: MemberAccess, projectId: string): Flag[] {
    const supported = fromMask(menuByKey(WORK_ORDER_MENU)?.supported ?? 0);
    return supported.filter((flag) =>
      can(access, WORK_ORDER_MENU, flag, { projectId }),
    );
  }

  financial(access: MemberAccess, projectId: string): boolean {
    return can(access, WORK_ORDER_MENU, "financial", { projectId });
  }

  /** Create or Update on the Project: the form's pickers. */
  private assertEditor(access: MemberAccess, projectId: string): void {
    if (!can(access, WORK_ORDER_MENU, "create", { projectId }))
      assertCan(access, WORK_ORDER_MENU, "update", { projectId });
  }

  /** A draft is changed by its creator (with Create) or a holder of `flag`. */
  private assertDraftEditor(
    access: MemberAccess,
    workOrder: StoredWorkOrder,
    flag: "update" | "delete",
  ): void {
    const scope = { projectId: workOrder.projectId };
    if (
      workOrder.createdBy === access.userId &&
      can(access, WORK_ORDER_MENU, "create", scope)
    )
      return;
    assertCan(access, WORK_ORDER_MENU, flag, scope);
  }

  /** Names for lists and details. */
  async views(
    db: ContractsTx,
    workspaceId: string,
    workOrders: readonly StoredWorkOrder[],
  ): Promise<WorkOrderView[]> {
    if (workOrders.length === 0) return [];
    const { directory, store } = this.deps;
    const byProject = new Map<string, string[]>();
    for (const workOrder of workOrders)
      byProject.set(workOrder.projectId, [
        ...(byProject.get(workOrder.projectId) ?? []),
        workOrder.contractorId,
      ]);
    const [contractorMaps, departments, lines] = await Promise.all([
      Promise.all(
        [...byProject].map(([projectId, ids]) =>
          directory.contractors(db, workspaceId, projectId, unique(ids)),
        ),
      ),
      directory.departments(
        db,
        workspaceId,
        unique(workOrders.map((workOrder) => workOrder.departmentId)),
      ),
      store.lines(
        db,
        workspaceId,
        workOrders.map((workOrder) => workOrder.id),
      ),
    ]);
    const contractors = new Map<string, ContractsContractorFacts>();
    for (const map of contractorMaps)
      for (const [id, facts] of map) contractors.set(id, facts);
    const linesOf = new Map<string, StoredWorkOrderLine[]>();
    for (const line of lines)
      linesOf.set(line.workOrderId, [
        ...(linesOf.get(line.workOrderId) ?? []),
        line,
      ]);
    return workOrders.map((workOrder) => {
      const own = linesOf.get(workOrder.id) ?? [];
      return {
        ...workOrder,
        contractorName: contractors.get(workOrder.contractorId)?.name ?? "",
        departmentName:
          workOrder.departmentId == null
            ? null
            : (departments.get(workOrder.departmentId)?.name ?? null),
        value: workOrderValue(own),
        lineCount: own.length,
      };
    });
  }

  // Reads ---------------------------------------------------------------------

  /** The Project's Work Orders, newest first (Work Order read). */
  async list(
    access: MemberAccess,
    projectId: string,
    params: WorkOrderListParams,
  ) {
    assertCan(access, WORK_ORDER_MENU, "read", { projectId });
    const { db, store } = this.deps;
    await this.project(db, access.workspaceId, projectId);
    const page = await store.list(db, {
      ...params,
      workspaceId: access.workspaceId,
      projectId,
    });
    return {
      ...page,
      items: await this.views(db, access.workspaceId, page.items),
      financial: this.financial(access, projectId),
      viewerFlags: this.viewerFlags(access, projectId),
    };
  }

  /** One Work Order with its lines, materials, revisions and warnings (read). */
  async get(access: MemberAccess, id: string): Promise<WorkOrderDetail> {
    const workOrder = await this.find(access.workspaceId, id);
    assertCan(access, WORK_ORDER_MENU, "read", {
      projectId: workOrder.projectId,
    });
    return this.detail(access, workOrder);
  }

  private async detail(
    access: MemberAccess,
    workOrder: StoredWorkOrder,
  ): Promise<WorkOrderDetail> {
    const { db, store, boq, directory } = this.deps;
    const ws = access.workspaceId;
    const projectId = workOrder.projectId;
    const [project, [view], lines, materials, revisions, billed, items] =
      await Promise.all([
        this.project(db, ws, projectId),
        this.views(db, ws, [workOrder]),
        store.lines(db, ws, [workOrder.id]),
        store.materials(db, ws, workOrder.id),
        store.revisions(db, ws, workOrder.id),
        store.billedByLine(db, ws, workOrder.id),
        boq.items(db, ws, projectId),
      ]);
    if (view == null) throw workOrderNotFound();
    const live = workOrder.status !== "cancelled";
    const elsewhere = live
      ? await store.orderedElsewhere(db, ws, projectId, workOrder.id)
      : new Map<string, bigint>();
    const itemById = new Map(items.map((item) => [item.id, item]));
    const [uoms, materialFacts, names] = await Promise.all([
      directory.uoms(
        db,
        ws,
        lines.map((line) => line.uomId),
      ),
      directory.materials(
        db,
        ws,
        materials.map((material) => material.materialId),
      ),
      store.names(db, ws, [
        workOrder.createdBy,
        ...(workOrder.decidedBy == null ? [] : [workOrder.decidedBy]),
        ...revisions.map((revision) => revision.createdBy),
      ]),
    ]);
    const showWarnings =
      workOrder.status === "draft" ||
      workOrder.status === "pending_approval" ||
      workOrder.status === "issued";
    return {
      workOrder: view,
      projectName: project.name,
      lines: lines.map((line) => {
        const item =
          line.boqItemId == null ? undefined : itemById.get(line.boqItemId);
        return {
          ...line,
          uomName: uoms.get(line.uomId)?.name ?? "",
          amount: workOrderLineAmount(line),
          billed: billed.get(line.id) ?? 0n,
          remaining:
            item == null
              ? null
              : remainingQuantity(item.quantity, elsewhere.get(item.id) ?? 0n),
        };
      }),
      materials: materials.map((material) => {
        const facts = materialFacts.get(material.materialId);
        return {
          ...material,
          materialName: facts?.name ?? "",
          uomName: facts?.uomName ?? "",
        };
      }),
      revisions: revisions.map((revision) => ({
        ...revision,
        createdByName: names.get(revision.createdBy) ?? null,
      })),
      warnings: showWarnings
        ? overRemaining(
            lines,
            new Map(
              items.map((item) => [
                item.id,
                { itemNo: item.itemNo, quantity: item.quantity },
              ]),
            ),
            elsewhere,
          )
        : [],
      createdByName: names.get(workOrder.createdBy) ?? null,
      decidedByName:
        workOrder.decidedBy == null
          ? null
          : (names.get(workOrder.decidedBy) ?? null),
      financial: this.financial(access, projectId),
      viewerFlags: this.viewerFlags(access, projectId),
    };
  }

  /** The Work Order as the PDF prints it (Print). */
  async print(access: MemberAccess, id: string): Promise<WorkOrderPrint> {
    const workOrder = await this.find(access.workspaceId, id);
    assertCan(access, WORK_ORDER_MENU, "print", {
      projectId: workOrder.projectId,
    });
    const { db, directory } = this.deps;
    const [detail, project, contractors] = await Promise.all([
      this.detail(access, workOrder),
      this.project(db, access.workspaceId, workOrder.projectId),
      directory.contractors(db, access.workspaceId, workOrder.projectId, [
        workOrder.contractorId,
      ]),
    ]);
    return {
      ...detail,
      project,
      contractor: contractors.get(workOrder.contractorId) ?? null,
    };
  }

  /** Contractors on the Project, UoMs, TDS natures and SAC codes (create or update). */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<WorkOrderFormOptions> {
    this.assertEditor(access, projectId);
    const { db, directory } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const [contractors, uoms] = await Promise.all([
      directory.contractorsOnProject(db, ws, projectId),
      directory.uomOptions(db, ws),
    ]);
    return {
      contractors: contractors.map((contractor) => ({
        ...contractor,
        departments: contractor.departments.filter((d) => d.active),
        defaultTdsNature: defaultTdsNature(contractor),
      })),
      uoms,
      tdsNatures: TDS_NATURES.map((key) => ({
        key,
        label: TDS_NATURE_LABELS[key],
      })),
      sacPresets: WORK_ORDER_SAC_PRESETS.map((preset) => ({ ...preset })),
      gstRates: [...WORK_ORDER_GST_RATES],
      financial: this.financial(access, projectId),
    };
  }

  /**
   * The BOQ's items in order with what each has left after the other Work
   * Orders (`exceptId`: the one being edited), for "Add from BOQ" (create or
   * update). Rates are the route's to null without Financial.
   */
  async boqItems(
    access: MemberAccess,
    projectId: string,
    exceptId: string | null,
  ): Promise<{ items: WorkOrderBoqItemOption[]; financial: boolean }> {
    this.assertEditor(access, projectId);
    const { db, boq, store, directory } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const [sections, items, elsewhere] = await Promise.all([
      boq.sections(db, ws, projectId),
      boq.items(db, ws, projectId),
      store.orderedElsewhere(db, ws, projectId, exceptId),
    ]);
    const [uoms, analysis] = await Promise.all([
      directory.uoms(
        db,
        ws,
        items.map((item) => item.uomId),
      ),
      store.analysisMaterials(db, ws, unique(items.map((item) => item.itemId))),
    ]);
    const order = new Map(
      sections.map((section, index) => [section.id, index]),
    );
    const titles = new Map(sections.map((s) => [s.id, s.title]));
    const sorted = [...items].sort(
      (a, b) =>
        (order.get(a.sectionId) ?? 0) - (order.get(b.sectionId) ?? 0) ||
        a.position - b.position,
    );
    return {
      items: sorted.map((item) => ({
        ...item,
        sectionTitle: titles.get(item.sectionId) ?? "",
        uomName: uoms.get(item.uomId)?.name ?? "",
        remaining: remainingQuantity(
          item.quantity,
          elsewhere.get(item.id) ?? 0n,
        ),
        analysis:
          item.itemId == null
            ? []
            : [...(analysis.get(item.itemId) ?? new Map<string, bigint>())].map(
                ([materialId, coefficient]) => ({ materialId, coefficient }),
              ),
      })),
      financial: this.financial(access, projectId),
    };
  }

  /** Enabled Materials for the materials panel, by name (create or update). */
  async materialOptions(
    access: MemberAccess,
    projectId: string,
    search: string | undefined,
  ): Promise<ContractsMaterialFacts[]> {
    this.assertEditor(access, projectId);
    const { db, directory } = this.deps;
    await this.project(db, access.workspaceId, projectId);
    return directory.materialOptions(db, access.workspaceId, {
      search,
      limit: WORK_ORDER_MATERIAL_OPTIONS_MAX,
    });
  }

  // Content -------------------------------------------------------------------

  /**
   * Checks a form against the Project inside the lock: the Contractor on
   * the Project (one the Work Order already has may stay), its Department,
   * the lines against the live BOQ, UoMs and Materials, the terms; fills
   * BOQ lines' blanks from the BOQ item and coefficients from the rate
   * analysis. Without Financial, rates and the mobilisation advance are
   * not taken: a kept line keeps its rate, a new BOQ line takes the BOQ's
   * current rate, a non-BOQ line ₹0.
   */
  private async resolve(
    tx: ContractsTx,
    access: MemberAccess,
    projectId: string,
    input: WorkOrderCommand,
    current: Current | null,
    mode: "create" | "edit" | "amend",
  ): Promise<Resolved> {
    const { directory, boq, store } = this.deps;
    const ws = access.workspaceId;
    const financial = this.financial(access, projectId);
    const at = this.clock();
    const header = workOrderHeader(input);

    // Parties
    const contractorId = input.contractorId.trim();
    const keepsContractor = current?.workOrder.contractorId === contractorId;
    if (mode === "amend" && !keepsContractor) throw workOrderContractorFixed();
    const contractor = (
      await directory.contractors(tx, ws, projectId, [contractorId])
    ).get(contractorId);
    if (
      contractor == null ||
      !(keepsContractor || (contractor.active && contractor.onProject))
    )
      throw workOrderContractorInvalid();
    const departmentId = blank(input.departmentId)
      ? null
      : (input.departmentId?.trim() ?? null);
    if (departmentId != null) {
      const department = contractor.departments.find(
        (item) => item.id === departmentId,
      );
      if (
        !usable(
          department,
          current?.workOrder.departmentId === departmentId && keepsContractor,
        )
      )
        throw workOrderDepartmentInvalid();
    }

    // Terms
    const termsInput: WorkOrderTermsInput = { ...(input.terms ?? {}) };
    if (!financial)
      termsInput.mobilisationAdvance =
        current?.workOrder.terms.mobilisationAdvance ?? null;
    const terms = workOrderTerms(
      termsInput,
      current == null
        ? defaultTdsNature(contractor)
        : current.workOrder.terms.tdsNature,
    );

    // Lines
    assertLineCount(input.lines.length);
    const [liveItems, elsewhere] = await Promise.all([
      boq.items(tx, ws, projectId),
      store.orderedElsewhere(tx, ws, projectId, current?.workOrder.id ?? null),
    ]);
    const itemById = new Map(liveItems.map((item) => [item.id, item]));
    const storedById = new Map(
      (current?.lines ?? []).map((line) => [line.id, line]),
    );
    const seenIds = new Set<string>();
    const lines: StoredWorkOrderLine[] = input.lines.map((line, index) => {
      const id = blank(line.id) ? null : (line.id?.trim() ?? null);
      const stored = id == null ? undefined : storedById.get(id);
      if (id != null && (stored == null || seenIds.has(id)))
        throw workOrderLineNotFound(index);
      if (id != null) seenIds.add(id);
      const kind = stored?.kind ?? line.kind;
      const boqItemId =
        stored != null
          ? stored.boqItemId
          : kind === "boq"
            ? (line.boqItemId?.trim() ?? null)
            : null;
      const item = boqItemId == null ? undefined : itemById.get(boqItemId);
      if (kind === "boq" && stored == null && item == null)
        throw workOrderBoqItemInvalid(index);
      const defaultQuantity =
        item == null
          ? null
          : (() => {
              const left = remainingQuantity(
                item.quantity,
                elsewhere.get(item.id) ?? 0n,
              );
              return left > 0n ? quantityText(left) : null;
            })();
      const rate = financial
        ? (line.rate ?? stored?.rate ?? item?.rate ?? -1)
        : (stored?.rate ?? item?.rate ?? 0n);
      const fields = workOrderLine(
        {
          kind,
          boqItemId,
          itemNo:
            line.itemNo === undefined
              ? (stored?.itemNo ?? item?.itemNo ?? null)
              : line.itemNo,
          description: blank(line.description)
            ? (stored?.description ?? item?.description ?? "")
            : (line.description ?? ""),
          uomId: blank(line.uomId)
            ? (stored?.uomId ?? item?.uomId ?? "")
            : (line.uomId ?? ""),
          sacHsn:
            line.sacHsn === undefined
              ? (stored?.sacHsn ?? item?.sacHsn ?? null)
              : line.sacHsn,
          quantity:
            line.quantity ??
            (stored == null ? defaultQuantity : quantityText(stored.quantity)),
          rate,
        },
        index,
      );
      return {
        id: stored?.id ?? newId(at.getTime()),
        workOrderId: current?.workOrder.id ?? "",
        ...fields,
        position: index,
      };
    });
    const uoms = await directory.uoms(
      tx,
      ws,
      lines.map((line) => line.uomId),
    );
    lines.forEach((line, index) => {
      if (
        !usable(
          uoms.get(line.uomId),
          storedById.get(line.id)?.uomId === line.uomId,
        )
      )
        throw workOrderLineUomInvalid(index);
    });

    // Materials
    const storedMaterials = new Map(
      (current?.materials ?? []).map((material) => [
        material.materialId,
        material,
      ]),
    );
    let materials: StoredWorkOrderMaterial[];
    if (input.materials == null) {
      const kept = new Set(lines.map((line) => line.id));
      materials = (current?.materials ?? []).map((material) => ({
        ...material,
        id: newId(at.getTime()),
        coefficients: material.coefficients.filter((c) => kept.has(c.lineId)),
      }));
    } else {
      const materialFacts = await directory.materials(
        tx,
        ws,
        input.materials.map((material) => material.materialId.trim()),
      );
      const fields = input.materials.map((material, index) => {
        const materialId = material.materialId.trim();
        const stored = storedMaterials.get(materialId);
        const facts = materialFacts.get(materialId);
        if (!usable(facts, stored != null))
          throw workOrderMaterialInvalid(index);
        return workOrderMaterial(
          financial
            ? material
            : {
                ...material,
                issueRate:
                  stored?.issueRate ??
                  (material.issueBasis === "at_cost"
                    ? (facts?.unitRate ?? 0n)
                    : null),
                penalRate: stored?.penalRate ?? null,
              },
          index,
          lines.length,
        );
      });
      assertMaterialsDistinct(fields);
      const analysis = await store.analysisMaterials(
        tx,
        ws,
        unique(
          lines.map((line) =>
            line.boqItemId == null
              ? null
              : (itemById.get(line.boqItemId)?.itemId ?? null),
          ),
        ),
      );
      const libraryItems = lines.map((line) =>
        line.boqItemId == null
          ? null
          : (itemById.get(line.boqItemId)?.itemId ?? null),
      );
      materials = fields.map((material) => ({
        id: newId(at.getTime()),
        workOrderId: current?.workOrder.id ?? "",
        materialId: material.materialId,
        issueBasis: material.issueBasis,
        issueRate: material.issueRate,
        wastagePercent: material.wastagePercent,
        penalRate: material.penalRate,
        coefficients: [
          ...resolvedCoefficients(material, libraryItems, analysis),
        ].map(([index, coefficient]) => ({
          lineId: lines[index]?.id ?? "",
          coefficient,
        })),
      }));
    }

    return {
      contractor,
      workOrder: {
        contractorId,
        departmentId,
        orderDate: header.orderDate,
        validUntil: header.validUntil,
        scope: header.scope,
        terms,
      },
      lines,
      materials,
      warnings: overRemaining(
        lines,
        new Map(
          liveItems.map((item) => [
            item.id,
            { itemNo: item.itemNo, quantity: item.quantity },
          ]),
        ),
        elsewhere,
      ),
    };
  }

  /** The revision kept when an issued Work Order is amended. */
  private async snapshot(
    tx: ContractsTx,
    workspaceId: string,
    current: Current,
    contractorName: string,
  ): Promise<WorkOrderSnapshot> {
    const { directory } = this.deps;
    const { workOrder, lines, materials } = current;
    const [uoms, materialFacts, departments] = await Promise.all([
      directory.uoms(
        tx,
        workspaceId,
        lines.map((line) => line.uomId),
      ),
      directory.materials(
        tx,
        workspaceId,
        materials.map((material) => material.materialId),
      ),
      directory.departments(tx, workspaceId, unique([workOrder.departmentId])),
    ]);
    return {
      revision: workOrder.revision,
      number: workOrder.number,
      contractorId: workOrder.contractorId,
      contractorName,
      departmentId: workOrder.departmentId,
      departmentName:
        workOrder.departmentId == null
          ? null
          : (departments.get(workOrder.departmentId)?.name ?? null),
      orderDate: workOrder.orderDate,
      validUntil: workOrder.validUntil,
      scope: workOrder.scope,
      terms: termsSnapshot(workOrder.terms),
      lines: lines.map((line) => ({
        id: line.id,
        kind: line.kind,
        boqItemId: line.boqItemId,
        itemNo: line.itemNo,
        description: line.description,
        uomId: line.uomId,
        uomName: uoms.get(line.uomId)?.name ?? "",
        sacHsn: line.sacHsn,
        quantity: quantityText(line.quantity),
        rate: Number(line.rate),
        amount: Number(workOrderLineAmount(line)),
      })),
      value: Number(workOrderValue(lines)),
      materials: materials.map((material) => ({
        materialId: material.materialId,
        materialName: materialFacts.get(material.materialId)?.name ?? "",
        issueBasis: material.issueBasis,
        issueRate:
          material.issueRate == null ? null : Number(material.issueRate),
        wastagePercent: percent(material.wastagePercent),
        penalRate:
          material.penalRate == null ? null : Number(material.penalRate),
        coefficients: material.coefficients.map((c) => ({
          lineId: c.lineId,
          coefficient: fixedDecimal(c.coefficient, 4),
        })),
      })),
    };
  }

  private async dispatch(
    workOrder: StoredWorkOrder,
    outcome: ApprovalOutcome,
    by: string,
    at: Date,
    issued?: { contractorName: string },
  ): Promise<void> {
    const events = [
      approvalEvent(
        {
          workspaceId: workOrder.workspaceId,
          documentType: WORK_ORDER_DOCUMENT_TYPE,
          documentId: workOrder.id,
          projectId: workOrder.projectId,
          number: workOrder.number,
          createdBy: workOrder.createdBy,
        },
        outcome,
        by,
        at,
      ),
      ...(issued == null
        ? []
        : [
            {
              type: "WorkOrderIssued",
              workspaceId: workOrder.workspaceId,
              occurredAt: at,
              workOrderId: workOrder.id,
              projectId: workOrder.projectId,
              number: workOrder.number ?? "",
              contractorName: issued.contractorName,
              by,
            } satisfies WorkOrderIssued,
          ]),
    ];
    await this.deps.events.dispatch(events);
  }

  private checkStale(workOrder: StoredWorkOrder, expected: Date | null) {
    if (
      expected != null &&
      workOrder.updatedAt.getTime() !== expected.getTime()
    )
      throw workOrderChanged();
  }

  private async save(
    tx: ContractsTx,
    after: StoredWorkOrder,
    expected: Date,
  ): Promise<void> {
    if (!(await this.deps.store.update(tx, after, expected)))
      throw workOrderChanged();
  }

  private async audit(
    tx: ContractsTx,
    access: MemberAccess,
    action: string,
    id: string,
    at: Date,
    change: { before?: unknown; after?: unknown },
  ): Promise<void> {
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action,
      entityType: "work_order",
      entityId: id,
      ...change,
      occurredAt: at,
    });
  }

  // Commands ------------------------------------------------------------------

  /** A draft Work Order (Create). Over-remaining BOQ lines come back as warnings. */
  async create(
    access: MemberAccess,
    projectId: string,
    input: WorkOrderCommand,
  ): Promise<WorkOrderSaved> {
    assertCan(access, WORK_ORDER_MENU, "create", { projectId });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const check = await this.deps.backdated(access);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, projectId);
      const resolved = await this.resolve(
        tx,
        access,
        projectId,
        input,
        null,
        "create",
      );
      check("work_order", "create", resolved.workOrder.orderDate);
      const workOrder: StoredWorkOrder = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId,
        ...resolved.workOrder,
        number: null,
        status: "draft",
        revision: 0,
        completedOn: null,
        decidedAt: null,
        decidedBy: null,
        rejectReason: null,
        closedOn: null,
        closeReason: null,
        cancelledOn: null,
        cancelReason: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await store.insert(tx, workOrder);
      await store.saveLines(tx, {
        workspaceId: ws,
        workOrderId: workOrder.id,
        lines: resolved.lines.map((line) => ({
          ...line,
          workOrderId: workOrder.id,
        })),
        by: access.userId,
        at,
      });
      await store.replaceMaterials(tx, ws, workOrder.id, resolved.materials);
      await this.audit(tx, access, "work_order.created", workOrder.id, at, {
        after: auditSnapshot(workOrder, resolved.lines),
      });
      return { workOrder, warnings: resolved.warnings };
    });
  }

  /** Saves a draft (its creator with Create, or Update; 409 `WORK_ORDER_CHANGED` when stale). */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: WorkOrderCommand,
  ): Promise<WorkOrderSaved> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    return this.rewrite(access, before, expectedUpdatedAt, input, null);
  }

  /**
   * Amends an issued Work Order (Update **and** Approve, with a reason):
   * the current terms and lines are kept as a revision, the change applied
   * and `revision` incremented. There is no second approval: the amender
   * holds Approve. Billed lines stay, at or above what was billed.
   */
  async amend(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    reason: string,
    input: WorkOrderCommand,
  ): Promise<WorkOrderSaved> {
    const before = await this.find(access.workspaceId, id);
    const scope = { projectId: before.projectId };
    assertCan(access, WORK_ORDER_MENU, "update", scope);
    assertCan(access, WORK_ORDER_MENU, "approve", scope);
    const why = workOrderReason(reason, "AMENDMENT_REASON_REQUIRED");
    return this.rewrite(access, before, expectedUpdatedAt, input, why);
  }

  private async rewrite(
    access: MemberAccess,
    before: StoredWorkOrder,
    expectedUpdatedAt: Date,
    input: WorkOrderCommand,
    amendment: string | null,
  ): Promise<WorkOrderSaved> {
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const check = await this.deps.backdated(access);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, before.id);
      const stored = current.workOrder;
      assertWorkOrderAction(
        stored.status,
        amendment == null ? "edit" : "amend",
      );
      this.checkStale(stored, expectedUpdatedAt);
      const resolved = await this.resolve(
        tx,
        access,
        stored.projectId,
        input,
        current,
        amendment == null ? "edit" : "amend",
      );
      check("work_order", "edit", stored.orderDate);
      if (resolved.workOrder.orderDate !== stored.orderDate)
        check("work_order", "edit", resolved.workOrder.orderDate);
      if (amendment != null) {
        const billed = await store.billedByLine(tx, ws, stored.id);
        assertBilledLinesKept(
          resolved.lines,
          billed,
          new Map(current.lines.map((line) => [line.id, line.itemNo])),
        );
        await store.insertRevision(tx, ws, {
          id: newId(at.getTime()),
          workOrderId: stored.id,
          revision: stored.revision,
          reason: amendment,
          snapshot: await this.snapshot(
            tx,
            ws,
            current,
            resolved.contractor.name,
          ),
          createdAt: at,
          createdBy: access.userId,
        });
      }
      const after: StoredWorkOrder = {
        ...stored,
        ...resolved.workOrder,
        revision: amendment == null ? stored.revision : stored.revision + 1,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, expectedUpdatedAt);
      await store.saveLines(tx, {
        workspaceId: ws,
        workOrderId: stored.id,
        lines: resolved.lines.map((line) => ({
          ...line,
          workOrderId: stored.id,
        })),
        by: access.userId,
        at,
      });
      await store.replaceMaterials(
        tx,
        ws,
        stored.id,
        resolved.materials.map((material) => ({
          ...material,
          workOrderId: stored.id,
        })),
      );
      await this.audit(
        tx,
        access,
        amendment == null ? "work_order.updated" : "work_order.amended",
        stored.id,
        at,
        {
          before: auditSnapshot(stored, current.lines),
          after: {
            ...auditSnapshot(after, resolved.lines),
            ...(amendment == null ? {} : { reason: amendment }),
          },
        },
      );
      return { workOrder: after, warnings: resolved.warnings };
    });
  }

  /** Deletes a draft (a tombstone; its number, if it had one, is not reissued). */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "delete");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await store.find(tx, ws, id);
      if (current == null) throw workOrderNotFound();
      assertWorkOrderAction(current.status, "delete");
      this.checkStale(current, expectedUpdatedAt);
      const deleted = await store.delete(tx, {
        workOrder: current,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw workOrderChanged();
      await this.audit(tx, access, "work_order.deleted", id, at, {
        before: auditSnapshot(current),
      });
    });
  }

  /**
   * Sends a draft for approval (its creator with Create, or Update). The
   * first submission takes the number from the `work_order` sequence rule,
   * dated the order date; a resubmission after a rejection keeps it.
   */
  async submit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredWorkOrder> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const submitted = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.current(tx, ws, id);
      const stored = current.workOrder;
      assertWorkOrderAction(stored.status, "submit");
      this.checkStale(stored, expectedUpdatedAt);
      assertLineCount(current.lines.length);
      const number =
        stored.number ??
        (
          await nextSequenceNumber(tx, {
            workspaceId: ws,
            module: "work_order",
            projectId: stored.projectId,
            date: stored.orderDate,
            by: access.userId,
          })
        ).number;
      const pending = pendingState();
      const after: StoredWorkOrder = {
        ...stored,
        number,
        status: "pending_approval",
        decidedAt: pending.decidedAt,
        decidedBy: pending.decidedBy,
        rejectReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, stored.updatedAt);
      await this.audit(tx, access, "work_order.submitted", id, at, {
        before: auditSnapshot(stored),
        after: auditSnapshot(after),
      });
      return after;
    });
    await this.dispatch(submitted, { kind: "submitted" }, access.userId, at);
    return submitted;
  }

  /** Approves a pending Work Order, which issues it (Approve; 409 `WORK_ORDER_NOT_PENDING`). */
  async approve(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredWorkOrder> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, WORK_ORDER_MENU, "approve", {
      projectId: before.projectId,
    });
    const { db, store, boq, directory } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const { decided, contractorName } = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await store.find(tx, ws, id);
      if (current == null) throw workOrderNotFound();
      const state = approve(
        this.approvalState(current),
        { userId: access.userId, at },
        WORK_ORDER_NAMING,
      );
      this.checkStale(current, expectedUpdatedAt);
      const after: StoredWorkOrder = {
        ...current,
        status: "issued",
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "work_order.approved", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      const contractor = (
        await directory.contractors(tx, ws, current.projectId, [
          current.contractorId,
        ])
      ).get(current.contractorId);
      return { decided: after, contractorName: contractor?.name ?? "" };
    });
    await this.dispatch(decided, { kind: "approved" }, access.userId, at, {
      contractorName,
    });
    return decided;
  }

  /**
   * Rejects a pending Work Order with a reason (Reject): it goes back to
   * draft with the reason shown, keeping its number.
   */
  async reject(
    access: MemberAccess,
    id: string,
    reason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredWorkOrder> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, WORK_ORDER_MENU, "reject", {
      projectId: before.projectId,
    });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await store.find(tx, ws, id);
      if (current == null) throw workOrderNotFound();
      const state = reject(
        this.approvalState(current),
        { userId: access.userId, at },
        reason,
        WORK_ORDER_NAMING,
      );
      this.checkStale(current, expectedUpdatedAt);
      const after: StoredWorkOrder = {
        ...current,
        status: "draft",
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: state.rejectionReason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "work_order.rejected", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
    await this.dispatch(
      decided,
      { kind: "rejected", reason: decided.rejectReason },
      access.userId,
      at,
    );
    return decided;
  }

  /** The kernel decides only a pending Work Order (409 `WORK_ORDER_NOT_PENDING`). */
  private approvalState(workOrder: StoredWorkOrder) {
    if (workOrder.status !== "pending_approval")
      throw workOrderNotPending(workOrder.status);
    return pendingState();
  }

  /**
   * Closes an issued Work Order with a date and reason (Update): refused
   * while a bill on it is draft or pending (409 `WORK_ORDER_BILL_OPEN`).
   * The close date is its completion date when none was recorded.
   */
  async close(
    access: MemberAccess,
    id: string,
    input: { closedOn: string; reason: string },
    expectedUpdatedAt: Date | null,
  ): Promise<StoredWorkOrder> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, WORK_ORDER_MENU, "update", {
      projectId: before.projectId,
    });
    const closedOn: CalendarDate = assertCalendarDate(
      input.closedOn.trim(),
      "CLOSED_ON_INVALID",
    );
    const reason = workOrderReason(input.reason, "CLOSE_REASON_REQUIRED");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await store.find(tx, ws, id);
      if (current == null) throw workOrderNotFound();
      assertWorkOrderAction(current.status, "close");
      this.checkStale(current, expectedUpdatedAt);
      if (daysBetween(current.orderDate, closedOn) < 0)
        throw closedOnBeforeOrderDate();
      const open = await store.openBills(tx, ws, id);
      if (open > 0) throw workOrderBillOpen(open);
      const after: StoredWorkOrder = {
        ...current,
        status: "closed",
        closedOn,
        closeReason: reason,
        completedOn: current.completedOn ?? closedOn,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "work_order.closed", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
  }

  /**
   * Cancels a draft or issued Work Order with a reason (Update), dated
   * the Company's today: refused once an approved bill names one of its
   * lines (409 `WORK_ORDER_BILLED`) or while a bill is open (409
   * `WORK_ORDER_BILL_OPEN`). Its lines stop counting against the BOQ.
   */
  async cancel(
    access: MemberAccess,
    id: string,
    rawReason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredWorkOrder> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, WORK_ORDER_MENU, "update", {
      projectId: before.projectId,
    });
    const reason = workOrderReason(rawReason, "CANCEL_REASON_REQUIRED");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await store.find(tx, ws, id);
      if (current == null) throw workOrderNotFound();
      assertWorkOrderAction(current.status, "cancel");
      this.checkStale(current, expectedUpdatedAt);
      if ((await store.billedByLine(tx, ws, id)).size > 0)
        throw workOrderBilled();
      const open = await store.openBills(tx, ws, id);
      if (open > 0) throw workOrderBillOpen(open);
      const after: StoredWorkOrder = {
        ...current,
        status: "cancelled",
        cancelledOn: today,
        cancelReason: reason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.save(tx, after, current.updatedAt);
      await this.audit(tx, access, "work_order.cancelled", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
  }
}
