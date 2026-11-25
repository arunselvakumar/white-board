import { todayInIndia } from "../domain/dates";
import { conflict, forbidden, invalid, notFound } from "../domain/errors";
import {
  assertEnoughStock,
  isLowStock,
  quantityDelta,
  type StockMovementKind,
} from "../domain/stock";
import type { StockCategory } from "../domain/stock-item";
import { assertStockLines, stockMovedOn } from "../domain/stock-movement";
import {
  assertCentre,
  assertManagerOf,
  assertRole,
  canReadChild,
  type PreschoolActor,
} from "./access";
import type { NewStockMovement, StockStore } from "./stock-ports";
import type {
  ChildStockIssuedView,
  StockLedgerView,
  StockMovementResultView,
  StockOnHandView,
} from "./stock-views";

export type StockLine = { itemId: string; quantity: number };

type Common = {
  centreId: string;
  /** Defaults to today in India; never in the future. */
  movedOn?: string;
  note?: string | null;
};

export type ReceiveStockInput = Common & {
  supplierName?: string | null;
  billNumber?: string | null;
  lines: (StockLine & { unitCostPaise?: number | null })[];
};

export type IssueStockInput = Common & { lines: StockLine[] };

export type AdjustStockInput = {
  centreId: string;
  itemId: string;
  /** Signed: −3 for three damaged, +2 for two found. */
  quantity: number;
  movedOn?: string;
  /** Why: required. */
  note: string;
};

export type TransferStockInput = {
  fromCentreId: string;
  toCentreId: string;
  movedOn?: string;
  note?: string | null;
  lines: StockLine[];
};

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Stock on hand per Centre is the sum of its Stock Movements, an append-only
 * ledger. Every movement is checked so stock on hand never goes below zero.
 */
export class StockHandlers {
  constructor(private readonly deps: { store: StockStore; now: () => Date }) {}

  async onHand(
    actor: PreschoolActor,
    query: { centreId: string; category?: StockCategory; lowOnly?: boolean },
  ): Promise<StockOnHandView> {
    assertManagerOf(actor, query.centreId);
    const rows = (
      await this.deps.store.onHand(actor.workspaceId, query.centreId)
    ).map((row) => ({ ...row, low: isLowStock(row.onHand, row.reorderLevel) }));
    return {
      centreId: query.centreId,
      itemsInStock: rows.filter((row) => row.onHand > 0).length,
      lowItems: rows.filter((row) => row.low).length,
      items: rows.filter(
        (row) =>
          (query.category == null || row.category === query.category) &&
          (query.lowOnly !== true || row.low),
      ),
    };
  }

  async receive(
    actor: PreschoolActor,
    input: ReceiveStockInput,
  ): Promise<StockMovementResultView> {
    assertManagerOf(actor, input.centreId);
    const items = await this.items(actor.workspaceId, input.lines);
    const archived = items.find((item) => item.isArchived);
    if (archived != null)
      throw conflict(
        "STOCK_ITEM_ARCHIVED",
        `${archived.name} is archived. Restore it before receiving more.`,
      );
    for (const line of input.lines)
      if (
        line.unitCostPaise != null &&
        (!Number.isInteger(line.unitCostPaise) || line.unitCostPaise < 0)
      )
        throw invalid(
          "STOCK_UNIT_COST_INVALID",
          "A unit cost is whole paise of zero or more.",
        );
    const movedOn = this.movedOn(input.movedOn);
    return this.record(
      actor,
      input.lines.map((line) => ({
        ...this.base(actor, input.centreId, movedOn, input.note),
        itemId: line.itemId,
        kind: "received",
        quantityDelta: quantityDelta("received", line.quantity),
        supplierName: text(input.supplierName),
        billNumber: text(input.billNumber),
        unitCostPaise: line.unitCostPaise ?? null,
      })),
    );
  }

  async issueToChild(
    actor: PreschoolActor,
    input: IssueStockInput & { childId: string },
  ): Promise<StockMovementResultView> {
    assertManagerOf(actor, input.centreId);
    const child = await this.deps.store.child(actor.workspaceId, input.childId);
    if (child == null) throw notFound("CHILD_NOT_FOUND", "Child not found.");
    if (child.centreId !== input.centreId)
      throw invalid(
        "STOCK_CHILD_OTHER_CENTRE",
        `${child.name} belongs to another Centre.`,
      );
    return this.issue(actor, input, "issued_to_child", {
      childId: child.id,
    });
  }

  async issueToClassroom(
    actor: PreschoolActor,
    input: IssueStockInput & { classroomId: string },
  ): Promise<StockMovementResultView> {
    assertManagerOf(actor, input.centreId);
    const classroom = await this.deps.store.classroom(
      actor.workspaceId,
      input.classroomId,
    );
    if (classroom == null)
      throw notFound("CLASSROOM_NOT_FOUND", "Classroom not found.");
    if (classroom.centreId !== input.centreId)
      throw invalid(
        "STOCK_CLASSROOM_OTHER_CENTRE",
        `${classroom.name} belongs to another Centre.`,
      );
    return this.issue(actor, input, "issued_to_classroom", {
      classroomId: classroom.id,
    });
  }

  async issueToStaff(
    actor: PreschoolActor,
    input: IssueStockInput & { staffId: string },
  ): Promise<StockMovementResultView> {
    assertManagerOf(actor, input.centreId);
    const staff = await this.deps.store.staff(actor.workspaceId, input.staffId);
    if (staff == null) throw notFound("STAFF_NOT_FOUND", "Staff not found.");
    if (staff.centreId !== input.centreId)
      throw invalid(
        "STOCK_STAFF_OTHER_CENTRE",
        `${staff.name} works at another Centre.`,
      );
    return this.issue(actor, input, "issued_to_staff", { staffId: staff.id });
  }

  async adjust(
    actor: PreschoolActor,
    input: AdjustStockInput,
  ): Promise<StockMovementResultView> {
    assertManagerOf(actor, input.centreId);
    const note = text(input.note);
    if (note == null)
      throw invalid(
        "STOCK_ADJUST_NOTE_REQUIRED",
        "Say why: damaged, lost, or a count correction.",
      );
    await this.items(actor.workspaceId, [input]);
    const movedOn = this.movedOn(input.movedOn);
    return this.record(actor, [
      {
        ...this.base(actor, input.centreId, movedOn, note),
        itemId: input.itemId,
        kind: "adjusted",
        quantityDelta: quantityDelta("adjusted", input.quantity),
      },
    ]);
  }

  /** Head Office sends stock from one Centre to another (Owner only). */
  async transfer(
    actor: PreschoolActor,
    input: TransferStockInput,
  ): Promise<StockMovementResultView> {
    assertRole(actor, ["owner"], "Only the Owner moves stock between Centres.");
    assertCentre(actor, input.fromCentreId);
    assertCentre(actor, input.toCentreId);
    if (input.fromCentreId === input.toCentreId)
      throw invalid(
        "STOCK_TRANSFER_SAME_CENTRE",
        "Choose a different Centre to send the stock to.",
      );
    await this.items(actor.workspaceId, input.lines);
    const movedOn = this.movedOn(input.movedOn);
    const transferId = crypto.randomUUID();
    return this.record(
      actor,
      input.lines.flatMap((line): NewStockMovement[] => [
        {
          ...this.base(actor, input.fromCentreId, movedOn, input.note),
          itemId: line.itemId,
          kind: "transfer_out",
          quantityDelta: quantityDelta("transfer_out", line.quantity),
          transferId,
          otherCentreId: input.toCentreId,
        },
        {
          ...this.base(actor, input.toCentreId, movedOn, input.note),
          itemId: line.itemId,
          kind: "transfer_in",
          quantityDelta: quantityDelta("transfer_in", line.quantity),
          transferId,
          otherCentreId: input.fromCentreId,
        },
      ]),
    );
  }

  async ledger(
    actor: PreschoolActor,
    query: {
      centreId: string;
      itemId?: string;
      childId?: string;
      kind?: StockMovementKind;
      from?: string;
      to?: string;
      limit?: number;
      cursor?: string;
    },
  ): Promise<StockLedgerView> {
    assertManagerOf(actor, query.centreId);
    if (query.from != null && query.to != null && query.from > query.to)
      throw invalid("DATE_RANGE_INVALID", "`from` must not be after `to`.");
    if (query.itemId != null)
      await this.items(actor.workspaceId, [{ itemId: query.itemId }]);
    return this.deps.store.ledger(actor.workspaceId, {
      centreId: query.centreId,
      itemId: query.itemId ?? null,
      childId: query.childId ?? null,
      kind: query.kind ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      limit: query.limit ?? 50,
      cursor: query.cursor ?? null,
    });
  }

  /**
   * What a Child has been handed. Managers of the Child's Centre, the
   * Child's Class Teacher, and the Child's own Parents may read it.
   */
  async childIssued(
    actor: PreschoolActor,
    childId: string,
  ): Promise<ChildStockIssuedView> {
    const child = await this.deps.store.child(actor.workspaceId, childId);
    if (child == null) throw notFound("CHILD_NOT_FOUND", "Child not found.");
    if (actor.role === "parent") {
      if (!canReadChild(actor, child))
        throw forbidden(
          "CHILD_FORBIDDEN",
          "You do not have access to this Child.",
        );
    } else {
      assertCentre(actor, child.centreId);
      if (
        actor.role === "teacher" &&
        (child.classroomId == null ||
          !actor.classroomIds.includes(child.classroomId))
      )
        throw forbidden(
          "CHILD_FORBIDDEN",
          "You do not have access to this Child.",
        );
    }
    return this.deps.store.childIssued(actor.workspaceId, childId);
  }

  private async issue(
    actor: PreschoolActor,
    input: IssueStockInput,
    kind: "issued_to_child" | "issued_to_classroom" | "issued_to_staff",
    to: { childId?: string; classroomId?: string; staffId?: string },
  ): Promise<StockMovementResultView> {
    await this.items(actor.workspaceId, input.lines);
    const movedOn = this.movedOn(input.movedOn);
    return this.record(
      actor,
      input.lines.map((line) => ({
        ...this.base(actor, input.centreId, movedOn, input.note),
        ...to,
        itemId: line.itemId,
        kind,
        quantityDelta: quantityDelta(kind, line.quantity),
      })),
    );
  }

  private async record(
    actor: PreschoolActor,
    movements: NewStockMovement[],
  ): Promise<StockMovementResultView> {
    const items = await this.deps.store.items(
      actor.workspaceId,
      movements.map((movement) => movement.itemId),
    );
    return this.deps.store.record(
      actor.workspaceId,
      movements,
      (movement, onHand) => {
        const item = items.find(
          (candidate) => candidate.id === movement.itemId,
        );
        assertEnoughStock(onHand, movement.quantityDelta, {
          name: item?.name ?? "this item",
          unit: item?.unit ?? "",
        });
      },
    );
  }

  /** Each line's item, found in the Workspace; one line per item. */
  private async items(
    workspaceId: string,
    lines: readonly { itemId: string }[],
  ): Promise<
    { id: string; name: string; unit: string; isArchived: boolean }[]
  > {
    assertStockLines(lines);
    const items = await this.deps.store.items(
      workspaceId,
      lines.map((line) => line.itemId),
    );
    if (items.length !== lines.length)
      throw notFound("STOCK_ITEM_NOT_FOUND", "Stock Item not found.");
    return items;
  }

  private movedOn(movedOn: string | undefined): string {
    return stockMovedOn(movedOn, todayInIndia(this.deps.now()));
  }

  private base(
    actor: PreschoolActor,
    centreId: string,
    movedOn: string,
    note: string | null | undefined,
  ) {
    return {
      centreId,
      movedOn,
      note: text(note),
      recordedByUserId: actor.userId,
      recordedByName: actor.userName,
    };
  }
}
