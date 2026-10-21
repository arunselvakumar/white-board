import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  approve,
  reject,
  type ApprovalState,
} from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
import { recordAudit } from "@/src/shared-kernel/audit";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import {
  boqItemNotFound,
  boqItemNoTaken,
  boqItemUomInvalid,
  boqSectionNotFound,
  quantityText,
  sameBoqKey,
} from "../domain/boq";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import {
  appliedChange,
  fromApprovalStatus,
  toApprovalStatus,
  variationChanged,
  variationContent,
  variationNotFound,
  variationNotPending,
  variationPending,
  VARIATION_NAMING,
  type VariationContent,
  type VariationInput,
  type VariationStatus,
} from "../domain/variation";
import { boqItemSnapshot } from "./boq-import";
import {
  BOQ_MENU,
  type BoqDeps,
  type StoredBoqItem,
  type StoredVariation,
  type VariationCursor,
} from "./boq-ports";
import type { ContractsTx } from "./ports";

/** The approval document type messaging links to the BOQ (`APPROVAL_DOCUMENTS`). */
export const VARIATION_DOCUMENT_TYPE = "variation";

export type VariationView = StoredVariation & {
  /** The item changed (or added): its number and description. */
  boqItemNo: string | null;
  boqItemDescription: string | null;
  sectionTitle: string | null;
  uomName: string | null;
  createdByName: string | null;
  decidedByName: string | null;
};

export type VariationListParams = {
  status?: VariationStatus;
  boqItemId?: string;
  limit: number;
  after?: VariationCursor;
  before?: VariationCursor;
};

function snapshot(variation: StoredVariation) {
  return {
    number: variation.number,
    kind: variation.kind,
    status: variation.status,
    boqItemId: variation.boqItemId,
    sectionId: variation.sectionId,
    itemNo: variation.itemNo,
    description: variation.description,
    uomId: variation.uomId,
    sacHsn: variation.sacHsn,
    previousQuantity:
      variation.previousQuantity == null
        ? null
        : quantityText(variation.previousQuantity),
    newQuantity:
      variation.newQuantity == null
        ? null
        : quantityText(variation.newQuantity),
    previousRate:
      variation.previousRate == null ? null : Number(variation.previousRate),
    newRate: variation.newRate == null ? null : Number(variation.newRate),
    reason: variation.reason,
    rejectReason: variation.rejectReason,
  };
}

function approvalState(variation: StoredVariation): ApprovalState {
  return {
    status: toApprovalStatus(variation.status),
    decidedAt: variation.decidedAt,
    decidedBy: variation.decidedBy,
    rejectionReason: variation.rejectReason,
  };
}

/** The columns a Variation's content writes; the others stay. */
function withContent(
  base: StoredVariation,
  content: VariationContent,
  item: StoredBoqItem | null,
): StoredVariation {
  const blank = {
    boqItemId: null,
    sectionId: null,
    itemNo: null,
    description: null,
    uomId: null,
    sacHsn: null,
    previousQuantity: null,
    newQuantity: null,
    previousRate: null,
    newRate: null,
  };
  switch (content.kind) {
    case "extra_item":
      return {
        ...base,
        ...blank,
        kind: "extra_item",
        reason: content.reason,
        sectionId: content.sectionId,
        itemNo: content.itemNo,
        description: content.description,
        uomId: content.uomId,
        sacHsn: content.sacHsn,
        newQuantity: content.newQuantity,
        newRate: content.newRate,
      };
    case "quantity":
      return {
        ...base,
        ...blank,
        kind: "quantity",
        reason: content.reason,
        boqItemId: content.boqItemId,
        previousQuantity: item?.quantity ?? null,
        newQuantity: content.newQuantity,
      };
    case "rate":
      return {
        ...base,
        ...blank,
        kind: "rate",
        reason: content.reason,
        boqItemId: content.boqItemId,
        previousRate: item?.rate ?? null,
        newRate: content.newRate,
      };
  }
}

/**
 * Variations of a Project's BOQ (CM-1103, ADR CM-0023 §4): created with a
 * reason and a `variation` sequence number, approved or rejected through
 * the approval kernel with the BOQ menu's Approve and Reject flags. A
 * pending one can be edited or deleted by its creator or a holder of BOQ
 * Update. At most one pending quantity or rate change per item (409
 * `VARIATION_PENDING`). Approval applies it in the same transaction.
 * `document.submitted|approved|rejected` are dispatched after commit.
 */
export class VariationHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: BoqDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async find(workspaceId: string, id: string): Promise<StoredVariation> {
    const variation = await this.deps.store.findVariation(
      this.deps.db,
      workspaceId,
      id,
    );
    if (variation == null) throw variationNotFound();
    return variation;
  }

  private async assertProject(workspaceId: string, projectId: string) {
    const project = await this.deps.directory.project(
      this.deps.db,
      workspaceId,
      projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    return project;
  }

  /** Rates are money: a rate change or an extra item needs Financial. */
  private assertKind(
    access: MemberAccess,
    projectId: string,
    kind: VariationInput["kind"],
  ): void {
    if (kind !== "quantity")
      assertCan(access, BOQ_MENU, "financial", { projectId });
  }

  /** The creator (with Create) or a holder of Update. */
  private assertEditor(access: MemberAccess, variation: StoredVariation): void {
    const scope = { projectId: variation.projectId };
    if (
      variation.createdBy === access.userId &&
      can(access, BOQ_MENU, "create", scope)
    )
      return;
    assertCan(access, BOQ_MENU, "update", scope);
  }

  async views(
    workspaceId: string,
    variations: readonly StoredVariation[],
  ): Promise<VariationView[]> {
    const { db, store, directory } = this.deps;
    const itemIds = [
      ...new Set(
        variations.flatMap((v) => (v.boqItemId == null ? [] : [v.boqItemId])),
      ),
    ];
    const sectionIds = [
      ...new Set(
        variations.flatMap((v) => (v.sectionId == null ? [] : [v.sectionId])),
      ),
    ];
    const [itemById, names] = await Promise.all([
      store.itemsById(db, workspaceId, itemIds),
      store.names(
        db,
        workspaceId,
        variations.flatMap((v) => [
          v.createdBy,
          ...(v.decidedBy == null ? [] : [v.decidedBy]),
        ]),
      ),
    ]);
    const sectionById = await store.sectionsById(db, workspaceId, [
      ...sectionIds,
      ...[...itemById.values()].map((item) => item.sectionId),
    ]);
    const uoms = await directory.uoms(
      db,
      workspaceId,
      variations.flatMap((v) => {
        const uomId =
          v.uomId ??
          (v.boqItemId == null ? null : itemById.get(v.boqItemId)?.uomId);
        return uomId == null ? [] : [uomId];
      }),
    );
    return variations.map((variation) => {
      const item =
        variation.boqItemId == null
          ? null
          : (itemById.get(variation.boqItemId) ?? null);
      const sectionId = variation.sectionId ?? item?.sectionId ?? null;
      const uomId = variation.uomId ?? item?.uomId ?? null;
      return {
        ...variation,
        boqItemNo: item?.itemNo ?? variation.itemNo,
        boqItemDescription: item?.description ?? variation.description,
        sectionTitle:
          sectionId == null
            ? null
            : (sectionById.get(sectionId)?.title ?? null),
        uomName: uomId == null ? null : (uoms.get(uomId)?.name ?? null),
        createdByName: names.get(variation.createdBy) ?? null,
        decidedByName:
          variation.decidedBy == null
            ? null
            : (names.get(variation.decidedBy) ?? null),
      };
    });
  }

  /** The Project's Variations, newest first (BOQ read). */
  async list(
    access: MemberAccess,
    projectId: string,
    params: VariationListParams,
  ) {
    assertCan(access, BOQ_MENU, "read", { projectId });
    await this.assertProject(access.workspaceId, projectId);
    const page = await this.deps.store.variations(this.deps.db, {
      ...params,
      workspaceId: access.workspaceId,
      projectId,
    });
    return {
      ...page,
      items: await this.views(access.workspaceId, page.items),
      financial: can(access, BOQ_MENU, "financial", { projectId }),
    };
  }

  async get(access: MemberAccess, id: string) {
    const variation = await this.find(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "read", { projectId: variation.projectId });
    const [view] = await this.views(access.workspaceId, [variation]);
    if (view == null) throw variationNotFound();
    return {
      variation: view,
      financial: can(access, BOQ_MENU, "financial", {
        projectId: variation.projectId,
      }),
    };
  }

  /**
   * Checks the content against the BOQ inside its lock: a quantity or rate
   * change names a live item of the Project with no other pending change;
   * an extra item joins a live section, with an enabled UoM and an item
   * number no live item or other pending extra item has.
   */
  private async checked(
    tx: ContractsTx,
    workspaceId: string,
    projectId: string,
    content: VariationContent,
    exceptId: string | null,
    keptUomId: string | null,
  ): Promise<StoredBoqItem | null> {
    const { store, directory } = this.deps;
    const pending = (
      await store.pendingVariations(tx, workspaceId, projectId)
    ).filter((variation) => variation.id !== exceptId);
    if (content.kind === "extra_item") {
      const section = await store.findSection(
        tx,
        workspaceId,
        content.sectionId,
      );
      if (section?.projectId !== projectId) throw boqSectionNotFound();
      const uoms = await directory.uoms(tx, workspaceId, [content.uomId]);
      const uom = uoms.get(content.uomId);
      if (uom == null || !(uom.active || keptUomId === content.uomId))
        throw boqItemUomInvalid();
      const taken =
        (await store.takenItemNos(tx, projectId, [content.itemNo], null))
          .length > 0 ||
        pending.some(
          (variation) =>
            variation.kind === "extra_item" &&
            variation.itemNo != null &&
            sameBoqKey(variation.itemNo, content.itemNo),
        );
      if (taken) throw boqItemNoTaken(content.itemNo);
      return null;
    }
    const item = await store.findItem(tx, workspaceId, content.boqItemId);
    if (item?.projectId !== projectId) throw boqItemNotFound();
    const waiting = pending.find(
      (variation) => variation.boqItemId === content.boqItemId,
    );
    if (waiting != null) throw variationPending(waiting.number);
    return item;
  }

  private async dispatch(
    variation: StoredVariation,
    outcome: ApprovalOutcome,
    by: string,
    at: Date,
  ): Promise<void> {
    await this.deps.events.dispatch([
      approvalEvent(
        {
          workspaceId: variation.workspaceId,
          documentType: VARIATION_DOCUMENT_TYPE,
          documentId: variation.id,
          projectId: variation.projectId,
          number: variation.number,
          createdBy: variation.createdBy,
        },
        outcome,
        by,
        at,
      ),
    ]);
  }

  /** Raises a Variation for approval (BOQ create; Financial for rates). */
  async create(
    access: MemberAccess,
    projectId: string,
    input: VariationInput,
  ): Promise<StoredVariation> {
    assertCan(access, BOQ_MENU, "create", { projectId });
    this.assertKind(access, projectId, input.kind);
    const content = variationContent(input);
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    await this.assertProject(ws, projectId);
    const today = await this.deps.today(ws);
    const at = this.clock();
    const variation = await db.$transaction(async (tx) => {
      await store.lock(tx, ws, projectId);
      const item = await this.checked(tx, ws, projectId, content, null, null);
      const { number } = await nextSequenceNumber(tx, {
        workspaceId: ws,
        module: "variation",
        projectId,
        date: today,
        by: access.userId,
      });
      const stored = withContent(
        {
          id: newId(at.getTime()),
          workspaceId: ws,
          projectId,
          number,
          kind: content.kind,
          status: "pending_approval",
          boqItemId: null,
          sectionId: null,
          itemNo: null,
          description: null,
          uomId: null,
          sacHsn: null,
          previousQuantity: null,
          newQuantity: null,
          previousRate: null,
          newRate: null,
          reason: content.reason,
          decidedAt: null,
          decidedBy: null,
          rejectReason: null,
          createdAt: at,
          updatedAt: at,
          createdBy: access.userId,
          updatedBy: access.userId,
        },
        content,
        item,
      );
      await store.insertVariation(tx, stored);
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "variation.created",
        entityType: "variation",
        entityId: stored.id,
        after: snapshot(stored),
        occurredAt: at,
      });
      return stored;
    });
    await this.dispatch(variation, { kind: "submitted" }, access.userId, at);
    return variation;
  }

  /** Edits a pending Variation; its kind stays (409 `VARIATION_CHANGED` when stale). */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: Omit<VariationInput, "kind">,
  ): Promise<StoredVariation> {
    const before = await this.find(access.workspaceId, id);
    this.assertEditor(access, before);
    this.assertKind(access, before.projectId, before.kind);
    const content = variationContent({ ...input, kind: before.kind });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await store.lock(tx, ws, before.projectId);
      const current = await store.findVariation(tx, ws, id);
      if (current == null) throw variationNotFound();
      if (current.status !== "pending_approval")
        throw variationNotPending(current.status);
      if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime())
        throw variationChanged();
      const item = await this.checked(
        tx,
        ws,
        current.projectId,
        content,
        id,
        current.uomId,
      );
      const after = withContent(
        { ...current, updatedAt: at, updatedBy: access.userId },
        content,
        item,
      );
      if (!(await store.updateVariation(tx, after, expectedUpdatedAt)))
        throw variationChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "variation.updated",
        entityType: "variation",
        entityId: id,
        before: snapshot(current),
        after: snapshot(after),
        occurredAt: at,
      });
      return after;
    });
  }

  /** Deletes a pending Variation (a tombstone); its number is not reissued. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const before = await this.find(access.workspaceId, id);
    this.assertEditor(access, before);
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await store.lock(tx, ws, before.projectId);
      const current = await store.findVariation(tx, ws, id);
      if (current == null) throw variationNotFound();
      if (current.status !== "pending_approval")
        throw variationNotPending(current.status);
      const deleted = await store.deleteVariation(tx, {
        variation: current,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw variationChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "variation.deleted",
        entityType: "variation",
        entityId: id,
        before: snapshot(current),
        occurredAt: at,
      });
    });
  }

  /**
   * Approves and applies, in one transaction (BOQ approve): an extra item
   * creates its BOQ item with the Variation's figures as its original
   * ones; a quantity or rate change sets the item's current figure and
   * keeps the replaced one on the Variation.
   */
  async approve(access: MemberAccess, id: string): Promise<StoredVariation> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "approve", { projectId: before.projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await store.lock(tx, ws, before.projectId);
      const current = await store.findVariation(tx, ws, id);
      if (current == null) throw variationNotFound();
      const state = approve(
        approvalState(current),
        { userId: access.userId, at },
        VARIATION_NAMING,
      );
      let after: StoredVariation = {
        ...current,
        status: fromApprovalStatus(state.status),
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (current.kind === "extra_item") {
        const section =
          current.sectionId == null
            ? null
            : await store.findSection(tx, ws, current.sectionId);
        if (section?.projectId !== current.projectId)
          throw boqSectionNotFound();
        const itemNo = current.itemNo ?? "";
        if (
          (await store.takenItemNos(tx, current.projectId, [itemNo], null))
            .length > 0
        )
          throw boqItemNoTaken(itemNo);
        const quantity = current.newQuantity ?? 0n;
        const rate = current.newRate ?? 0n;
        const siblings = (await store.items(tx, ws, current.projectId)).filter(
          (row) => row.sectionId === section.id,
        );
        const item: StoredBoqItem = {
          id: newId(at.getTime()),
          workspaceId: ws,
          projectId: current.projectId,
          sectionId: section.id,
          itemId: null,
          itemNo,
          description: current.description ?? "",
          uomId: current.uomId ?? "",
          sacHsn: current.sacHsn,
          originalQuantity: quantity,
          quantity,
          originalRate: rate,
          rate,
          wingId: null,
          locationId: null,
          position: Math.max(-1, ...siblings.map((row) => row.position)) + 1,
          variationId: current.id,
          createdAt: at,
          updatedAt: at,
          createdBy: access.userId,
          updatedBy: access.userId,
        };
        await store.insertItems(tx, [item]);
        after = { ...after, boqItemId: item.id };
        await recordAudit(tx, {
          workspaceId: ws,
          actorUserId: access.userId,
          action: "boq_item.created",
          entityType: "boq_item",
          entityId: item.id,
          after: { ...boqItemSnapshot(item), variationId: current.id },
          occurredAt: at,
        });
      } else {
        const item =
          current.boqItemId == null
            ? null
            : await store.findItem(tx, ws, current.boqItemId);
        if (item == null) throw boqItemNotFound();
        const applied = appliedChange(
          current.kind === "quantity"
            ? { kind: "quantity", newQuantity: current.newQuantity ?? 0n }
            : { kind: "rate", newRate: current.newRate ?? 0n },
          { quantity: item.quantity, rate: item.rate },
        );
        const next: StoredBoqItem = {
          ...item,
          quantity: applied.next.quantity,
          rate: applied.next.rate,
          updatedAt: at,
          updatedBy: access.userId,
        };
        await store.updateItem(tx, next, null);
        after = {
          ...after,
          previousQuantity: applied.previousQuantity,
          previousRate: applied.previousRate,
        };
        await recordAudit(tx, {
          workspaceId: ws,
          actorUserId: access.userId,
          action: "boq_item.updated",
          entityType: "boq_item",
          entityId: item.id,
          before: boqItemSnapshot(item),
          after: { ...boqItemSnapshot(next), variationId: current.id },
          occurredAt: at,
        });
      }
      if (!(await store.updateVariation(tx, after, current.updatedAt)))
        throw variationChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "variation.approved",
        entityType: "variation",
        entityId: id,
        before: snapshot(current),
        after: snapshot(after),
        occurredAt: at,
      });
      return after;
    });
    await this.dispatch(decided, { kind: "approved" }, access.userId, at);
    return decided;
  }

  /** Rejects with a reason (BOQ reject; 400 `REJECTION_REASON_REQUIRED`). */
  async reject(
    access: MemberAccess,
    id: string,
    reason: string,
  ): Promise<StoredVariation> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, BOQ_MENU, "reject", { projectId: before.projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await store.lock(tx, ws, before.projectId);
      const current = await store.findVariation(tx, ws, id);
      if (current == null) throw variationNotFound();
      const state = reject(
        approvalState(current),
        { userId: access.userId, at },
        reason,
        VARIATION_NAMING,
      );
      const after: StoredVariation = {
        ...current,
        status: fromApprovalStatus(state.status),
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: state.rejectionReason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.updateVariation(tx, after, current.updatedAt)))
        throw variationChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "variation.rejected",
        entityType: "variation",
        entityId: id,
        before: snapshot(current),
        after: snapshot(after),
        occurredAt: at,
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
}
