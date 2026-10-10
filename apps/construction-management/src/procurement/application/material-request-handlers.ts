import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";
import type {
  LocationRef,
  LocationRefInput,
} from "@/src/shared-kernel/location-ref";

import type { DeliveryNoteStatus } from "../domain/delivery-note";
import {
  materialRequestLines,
  receiverName,
  type MaterialRequestLineInput,
  type MaterialRequestStatus,
} from "../domain/material-request";
import type {
  Named,
  ProcurementCommandActor,
  StoreOption,
} from "./store-handlers";

export type MaterialRequestItemReadModel = {
  id: string;
  position: number;
  materialId: string;
  materialName: string;
  uomId: string;
  uomName: string;
  /** Decimal strings. */
  askQty: string;
  deliveredQty: string;
  /** Held by live Delivery Notes not yet delivered. */
  inFlightQty: string;
  /** Ask less delivered less in flight (zero once closed). */
  pendingQty: string;
  remark: string | null;
};

export type MaterialRequestDeliveryNoteSummary = {
  id: string;
  number: string;
  deliveryDate: CalendarDate;
  status: DeliveryNoteStatus;
};

export type MaterialRequestReadModel = {
  id: string;
  number: string;
  projectId: string;
  projectName: string | null;
  storeId: string;
  storeName: string | null;
  requestDate: CalendarDate;
  contractor: Named | null;
  department: Named | null;
  siteLocation: LocationRef | null;
  receiverName: string | null;
  remark: string | null;
  status: MaterialRequestStatus;
  closedAt: Date | null;
  closedBy: string | null;
  closeReason: string | null;
  items: MaterialRequestItemReadModel[];
  deliveryNotes: MaterialRequestDeliveryNoteSummary[];
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
};

export type MaterialRequestListParams = {
  workspaceId: string;
  projectId?: string;
  storeId?: string;
  status?: MaterialRequestStatus;
  from?: CalendarDate;
  to?: CalendarDate;
  /** Part of the number. */
  search?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type MaterialRequestListPage = {
  items: MaterialRequestReadModel[];
  hasMore: boolean;
  total: number;
};

export type MaterialRequestInput = {
  requestDate: CalendarDate;
  storeId: string;
  contractorId?: string | null;
  departmentId?: string | null;
  siteLocation?: LocationRefInput | null;
  receiverName?: string | null;
  remark?: string | null;
  items: readonly MaterialRequestLineInput[];
};

export type MaterialRequestCreate = MaterialRequestInput & {
  projectId: string;
};

/** Fields as the repository stores them, after the shape checks. */
export type MaterialRequestDraft = Omit<
  MaterialRequestInput,
  "items" | "receiverName"
> & {
  receiverName: string | null;
  items: ReturnType<typeof materialRequestLines>;
};

export type MaterialRequestFormPartyOptions = {
  contractors: Named[];
  departments: Named[];
};

export type MaterialRequestFormOptions = MaterialRequestFormPartyOptions & {
  /** Stores serving the Project ("Request To"). */
  stores: StoreOption[];
};

export type MaterialRequestRepository = {
  list(params: MaterialRequestListParams): Promise<MaterialRequestListPage>;
  find(
    workspaceId: string,
    id: string,
  ): Promise<MaterialRequestReadModel | null>;
  create(
    actor: ProcurementCommandActor,
    projectId: string,
    draft: MaterialRequestDraft,
  ): Promise<MaterialRequestReadModel>;
  update(
    actor: ProcurementCommandActor,
    id: string,
    draft: MaterialRequestDraft,
    expectedUpdatedAt: Date,
  ): Promise<MaterialRequestReadModel>;
  delete(
    actor: ProcurementCommandActor,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void>;
  close(
    actor: ProcurementCommandActor,
    id: string,
    reason: string,
    expectedUpdatedAt: Date,
  ): Promise<MaterialRequestReadModel>;
};

function draft(input: MaterialRequestInput): MaterialRequestDraft {
  return {
    ...input,
    receiverName: receiverName(input.receiverName),
    items: materialRequestLines(input.items),
  };
}

/** Material Requests from a Project to a Central Store (CM-508). */
export class MaterialRequestHandlers {
  constructor(private readonly requests: MaterialRequestRepository) {}

  list(params: MaterialRequestListParams) {
    return this.requests.list(params);
  }

  get(workspaceId: string, id: string) {
    return this.requests.find(workspaceId, id);
  }

  create(actor: ProcurementCommandActor, input: MaterialRequestCreate) {
    return this.requests.create(actor, input.projectId, draft(input));
  }

  update(
    actor: ProcurementCommandActor,
    id: string,
    input: MaterialRequestInput,
    expectedUpdatedAt: Date,
  ) {
    return this.requests.update(actor, id, draft(input), expectedUpdatedAt);
  }

  delete(actor: ProcurementCommandActor, id: string, expectedUpdatedAt: Date) {
    return this.requests.delete(actor, id, expectedUpdatedAt);
  }

  close(
    actor: ProcurementCommandActor,
    id: string,
    reason: string,
    expectedUpdatedAt: Date,
  ) {
    return this.requests.close(actor, id, reason, expectedUpdatedAt);
  }
}
