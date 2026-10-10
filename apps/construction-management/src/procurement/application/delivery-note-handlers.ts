import { optionalText } from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { bulkIds } from "@/src/shared-kernel/approval";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type {
  DeliveryNoteLineInput,
  DeliveryNoteStatus,
} from "../domain/delivery-note";
import { receiverName } from "../domain/material-request";
import type { ProcurementCommandActor } from "./store-handlers";

export type DeliveryNoteItemReadModel = {
  id: string;
  materialRequestItemId: string;
  position: number;
  materialId: string;
  materialName: string;
  uomName: string;
  /** Decimal strings. */
  quantity: string;
  /** The request line's Ask Qty. */
  requestedQty: string;
  /** What the request line still waits for, this note left out. */
  pendingQty: string;
};

export type DeliveryNoteReadModel = {
  id: string;
  number: string;
  materialRequestId: string;
  materialRequestNumber: string;
  storeId: string;
  storeName: string | null;
  projectId: string;
  projectName: string | null;
  deliveryDate: CalendarDate;
  deliveredTo: string | null;
  remark: string | null;
  status: DeliveryNoteStatus;
  decidedAt: Date | null;
  decidedBy: string | null;
  deliveredOn: CalendarDate | null;
  deliveredAt: Date | null;
  deliveredBy: string | null;
  items: DeliveryNoteItemReadModel[];
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
};

export type DeliveryNoteListParams = {
  workspaceId: string;
  storeId?: string;
  projectId?: string;
  materialRequestId?: string;
  status?: DeliveryNoteStatus;
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type DeliveryNoteListPage = {
  items: DeliveryNoteReadModel[];
  hasMore: boolean;
  total: number;
};

export type DeliveryNoteInput = {
  deliveryDate: CalendarDate;
  deliveredTo?: string | null;
  remark?: string | null;
  items: readonly DeliveryNoteLineInput[];
};

export type DeliveryNoteDraft = {
  deliveryDate: CalendarDate;
  deliveredTo: string | null;
  remark: string | null;
  items: readonly DeliveryNoteLineInput[];
};

export type DeliveryNoteRepository = {
  list(params: DeliveryNoteListParams): Promise<DeliveryNoteListPage>;
  find(workspaceId: string, id: string): Promise<DeliveryNoteReadModel | null>;
  create(
    actor: ProcurementCommandActor,
    materialRequestId: string,
    draft: DeliveryNoteDraft,
    approve: boolean,
  ): Promise<DeliveryNoteReadModel>;
  update(
    actor: ProcurementCommandActor,
    id: string,
    draft: DeliveryNoteDraft,
    expectedUpdatedAt: Date,
  ): Promise<DeliveryNoteReadModel>;
  delete(
    actor: ProcurementCommandActor,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void>;
  /** All or none, in one transaction. */
  approve(
    actor: ProcurementCommandActor,
    ids: readonly string[],
  ): Promise<void>;
  markDelivered(
    actor: ProcurementCommandActor,
    id: string,
    deliveredOn: CalendarDate,
    expectedUpdatedAt: Date,
  ): Promise<DeliveryNoteReadModel>;
};

function draft(input: DeliveryNoteInput): DeliveryNoteDraft {
  return {
    deliveryDate: input.deliveryDate,
    deliveredTo: receiverName(input.deliveredTo),
    remark: optionalText(input.remark, "remark"),
    items: input.items,
  };
}

/** Delivery Notes a Central Store sends against Material Requests (CM-508). */
export class DeliveryNoteHandlers {
  constructor(private readonly notes: DeliveryNoteRepository) {}

  list(params: DeliveryNoteListParams) {
    return this.notes.list(params);
  }

  get(workspaceId: string, id: string) {
    return this.notes.find(workspaceId, id);
  }

  create(
    actor: ProcurementCommandActor,
    input: DeliveryNoteInput & { materialRequestId: string; approve: boolean },
  ) {
    return this.notes.create(
      actor,
      input.materialRequestId,
      draft(input),
      input.approve,
    );
  }

  update(
    actor: ProcurementCommandActor,
    id: string,
    input: DeliveryNoteInput,
    expectedUpdatedAt: Date,
  ) {
    return this.notes.update(actor, id, draft(input), expectedUpdatedAt);
  }

  delete(actor: ProcurementCommandActor, id: string, expectedUpdatedAt: Date) {
    return this.notes.delete(actor, id, expectedUpdatedAt);
  }

  approve(actor: ProcurementCommandActor, ids: readonly string[]) {
    return this.notes.approve(actor, bulkIds(ids));
  }

  markDelivered(
    actor: ProcurementCommandActor,
    id: string,
    deliveredOn: CalendarDate,
    expectedUpdatedAt: Date,
  ) {
    return this.notes.markDelivered(actor, id, deliveredOn, expectedUpdatedAt);
  }
}
