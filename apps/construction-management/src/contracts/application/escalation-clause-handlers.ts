import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import { recordAudit } from "@/src/shared-kernel/audit";
import { DomainError, forbidden } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { projectNotContractWork } from "../domain/client-bill";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import {
  escalationClause,
  escalationClauseChanged,
  escalationClauseNotFound,
  escalationClauseUsed,
  type EscalationClauseInput,
} from "../domain/escalation";
import { fixedDecimal, PERCENT_SCALE } from "../domain/item-analysis";
import { workOrderNotFound } from "../domain/work-order";
import { menuOfSide, type ContractInput } from "./advance-handlers";
import type { ContractRef } from "./advance-ports";
import type {
  EscalationDeps,
  StoredEscalationClause,
} from "./escalation-ports";
import type { ContractsTx } from "./ports";
import type { StoredWorkOrder } from "./work-order-ports";

/**
 * Escalation clauses (CM-1109, ADR CM-0023 §9): one per Work Order
 * (contractor side, menu `contracts.work_orders`) and one for the
 * Project's client contract (client side, menu `contracts.client_bills`).
 * Read sees the clause; its weights, non-escalable % and base prices need
 * Financial. Adding, editing and removing need Update **and** Financial,
 * because the clause is money terms. Once an approved escalation bill on
 * the contract uses it, it is locked (409 `ESCALATION_CLAUSE_USED`).
 */

export type EscalationClauseView = {
  side: "contractor" | "client";
  projectId: string;
  workOrderId: string | null;
  workOrderNumber: string | null;
  clause: StoredEscalationClause | null;
  /** Approved escalation bills on the contract: the clause is locked when > 0. */
  approvedBills: number;
  financial: boolean;
  /** Update + Financial, and not locked. */
  canEdit: boolean;
  /**
   * CM-1110: the Work Order's issued materials a 10CA component can name,
   * so its quantity comes from material reconciliation (none on the
   * client side).
   */
  materialOptions: { id: string; name: string; uomName: string }[];
};

export function contractOf(input: ContractInput): ContractRef {
  const workOrderId = input.workOrderId?.trim() ?? "";
  return workOrderId === ""
    ? { side: "client", projectId: input.projectId }
    : { side: "contractor", projectId: input.projectId, workOrderId };
}

export function contractOfClause(clause: {
  projectId: string;
  workOrderId: string | null;
}): ContractRef {
  return contractOf(clause);
}

/** What an audit entry keeps of a clause. */
export function clauseSnapshot(clause: StoredEscalationClause) {
  return {
    side: clause.side,
    workOrderId: clause.workOrderId,
    baseMonth: clause.terms.baseMonth,
    nonEscalablePercent: fixedDecimal(
      clause.terms.nonEscalablePercent,
      PERCENT_SCALE,
    ),
    components: clause.terms.components.map((row) => ({
      component: row.component,
      basis: row.basis,
      weightPercent: fixedDecimal(row.weightPercent, PERCENT_SCALE),
      series: row.series,
      basePrice: row.basePrice == null ? null : Number(row.basePrice),
      materialId: row.materialId,
    })),
  };
}

/**
 * A 10CA component's Material (CM-1110) is one the Work Order issues (400
 * `ESCALATION_MATERIAL_INVALID`); the client contract issues none.
 */
function assertClauseMaterials(
  components: readonly { materialId: string | null }[],
  materialIds: ReadonlySet<string>,
): void {
  components.forEach((row, index) => {
    if (row.materialId == null || materialIds.has(row.materialId)) return;
    throw new DomainError(
      "ESCALATION_MATERIAL_INVALID",
      "Pick a material the Work Order issues.",
      {
        details: {
          component: index,
          field: `components.${String(index)}.materialId`,
        },
      },
    );
  });
}

export class EscalationClauseHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: EscalationDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  private financial(access: MemberAccess, contract: ContractRef): boolean {
    return can(access, menuOfSide(contract.side), "financial", {
      projectId: contract.projectId,
    });
  }

  /** Update and Financial on the side's menu (403 without either). */
  private assertEditor(access: MemberAccess, contract: ContractRef): void {
    assertCan(access, menuOfSide(contract.side), "update", {
      projectId: contract.projectId,
    });
    if (!this.financial(access, contract))
      throw forbidden(
        "PERMISSION_DENIED",
        "An escalation clause is money terms: changing it needs the Financial permission. Ask the Owner to change your Permission Matrix.",
      );
  }

  /**
   * The Project (404 `PROJECT_NOT_FOUND`) and, on the contractor side, a
   * Work Order of it (404 `WORK_ORDER_NOT_FOUND`); the client side needs
   * a Contract work Project (400 `PROJECT_NOT_CONTRACT_WORK`).
   */
  async resolve(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<{ workOrder: StoredWorkOrder | null }> {
    const project = await this.deps.directory.project(
      db,
      workspaceId,
      contract.projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    if (contract.side === "client") {
      if (project.role !== "contract") throw projectNotContractWork();
      return { workOrder: null };
    }
    const workOrder = await this.deps.workOrders.find(
      db,
      workspaceId,
      contract.workOrderId,
    );
    if (workOrder?.projectId !== contract.projectId) throw workOrderNotFound();
    return { workOrder };
  }

  async find(workspaceId: string, id: string): Promise<StoredEscalationClause> {
    const found = await this.deps.clauses.find(this.deps.db, workspaceId, id);
    if (found == null) throw escalationClauseNotFound();
    return found;
  }

  /** The contract's clause, or none (Read on the side's menu). */
  async get(
    access: MemberAccess,
    input: ContractInput,
  ): Promise<EscalationClauseView> {
    const contract = contractOf(input);
    assertCan(access, menuOfSide(contract.side), "read", {
      projectId: contract.projectId,
    });
    return this.view(this.deps.db, access, contract);
  }

  async view(
    db: ContractsTx,
    access: MemberAccess,
    contract: ContractRef,
  ): Promise<EscalationClauseView> {
    const ws = access.workspaceId;
    const { workOrder } = await this.resolve(db, ws, contract);
    const [clause, approvedBills, materials] = await Promise.all([
      this.deps.clauses.forContract(db, ws, contract),
      this.deps.bills.approvedCount(db, ws, contract),
      workOrder == null
        ? Promise.resolve([])
        : this.deps.workOrders.materials(db, ws, workOrder.id),
    ]);
    const facts = await this.deps.directory.materials(
      db,
      ws,
      materials.map((row) => row.materialId),
    );
    const financial = this.financial(access, contract);
    return {
      side: contract.side,
      projectId: contract.projectId,
      workOrderId: workOrder?.id ?? null,
      workOrderNumber: workOrder?.number ?? null,
      clause,
      approvedBills,
      financial,
      canEdit:
        approvedBills === 0 &&
        financial &&
        can(access, menuOfSide(contract.side), "update", {
          projectId: contract.projectId,
        }) &&
        workOrder?.status !== "cancelled",
      materialOptions: materials.map((row) => ({
        id: row.materialId,
        name: facts.get(row.materialId)?.name ?? "Material",
        uomName: facts.get(row.materialId)?.uomName ?? "",
      })),
    };
  }

  /** The materials a contract's 10CA components may name (CM-1110). */
  private async assertMaterials(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    components: readonly { materialId: string | null }[],
  ): Promise<void> {
    if (components.every((row) => row.materialId == null)) return;
    const issued =
      contract.side === "contractor"
        ? await this.deps.workOrders.materials(
            db,
            workspaceId,
            contract.workOrderId,
          )
        : [];
    assertClauseMaterials(
      components,
      new Set(issued.map((row) => row.materialId)),
    );
  }

  /** Adds the contract's clause (409 `ESCALATION_CLAUSE_EXISTS`). */
  async create(
    access: MemberAccess,
    input: ContractInput & EscalationClauseInput,
  ): Promise<EscalationClauseView> {
    const contract = contractOf(input);
    this.assertEditor(access, contract);
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const terms = escalationClause(input, { today });
    const at = this.clock();
    return this.deps.db.$transaction(async (tx) => {
      await this.deps.boq.lock(tx, ws, contract.projectId);
      await this.resolve(tx, ws, contract);
      await this.assertMaterials(tx, ws, contract, terms.components);
      const clause: StoredEscalationClause = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId: contract.projectId,
        side: contract.side,
        workOrderId:
          contract.side === "contractor" ? contract.workOrderId : null,
        terms,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
      };
      await this.deps.clauses.insert(tx, clause);
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "escalation_clause.created",
        entityType: "escalation_clause",
        entityId: clause.id,
        after: clauseSnapshot(clause),
        occurredAt: at,
      });
      return this.view(tx, access, contract);
    });
  }

  /** Replaces the clause's terms while no approved escalation bill uses it. */
  async update(
    access: MemberAccess,
    id: string,
    input: EscalationClauseInput & { expectedUpdatedAt: Date },
  ): Promise<EscalationClauseView> {
    const before = await this.find(access.workspaceId, id);
    const contract = contractOfClause(before);
    this.assertEditor(access, contract);
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const terms = escalationClause(input, { today });
    const at = this.clock();
    return this.deps.db.$transaction(async (tx) => {
      await this.deps.boq.lock(tx, ws, contract.projectId);
      const current = await this.deps.clauses.find(tx, ws, id);
      if (current == null) throw escalationClauseNotFound();
      if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
        throw escalationClauseChanged();
      const used = await this.deps.bills.approvedCount(tx, ws, contract);
      if (used > 0) throw escalationClauseUsed(used);
      await this.assertMaterials(tx, ws, contract, terms.components);
      const after: StoredEscalationClause = {
        ...current,
        terms,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await this.deps.clauses.update(tx, after, current.updatedAt)))
        throw escalationClauseChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "escalation_clause.updated",
        entityType: "escalation_clause",
        entityId: id,
        before: clauseSnapshot(current),
        after: clauseSnapshot(after),
        occurredAt: at,
      });
      return this.view(tx, access, contract);
    });
  }

  /** Removes the clause (a tombstone) while no approved escalation bill uses it. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<EscalationClauseView> {
    const before = await this.find(access.workspaceId, id);
    const contract = contractOfClause(before);
    this.assertEditor(access, contract);
    const ws = access.workspaceId;
    const at = this.clock();
    return this.deps.db.$transaction(async (tx) => {
      await this.deps.boq.lock(tx, ws, contract.projectId);
      const used = await this.deps.bills.approvedCount(tx, ws, contract);
      if (used > 0) throw escalationClauseUsed(used);
      const deleted = await this.deps.clauses.delete(tx, {
        clause: before,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw escalationClauseChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "escalation_clause.deleted",
        entityType: "escalation_clause",
        entityId: id,
        before: clauseSnapshot(before),
        occurredAt: at,
      });
      return this.view(tx, access, contract);
    });
  }
}
