import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { StockState } from "../domain/central-inventory";
import { storeDraft, type StoreDraft, type StoreInput } from "../domain/store";

/** Who runs a command: the Session's User in the Active Company. */
export type ProcurementCommandActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

export type Named = { id: string; name: string };

export type StoreReadModel = {
  id: string;
  name: string;
  address: string | null;
  stateCode: string | null;
  projects: Named[];
  keepers: Named[];
  suppliers: Named[];
  createdAt: Date;
  updatedAt: Date;
};

export type StoreListParams = {
  workspaceId: string;
  search?: string;
  /** Only stores serving this Project. */
  projectId?: string;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type StoreListPage = {
  items: StoreReadModel[];
  hasMore: boolean;
  total: number;
};

/** One material's stock at a store. */
export type StoreStockRow = {
  materialId: string;
  materialName: string;
  uomName: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Decimal strings. */
  stock: string;
  /** Dispatched to the store, not yet delivered. */
  inTransit: string;
  minimum: string | null;
  state: StockState;
};

export type StoreOption = {
  id: string;
  name: string;
  stateCode: string | null;
};

export type StoreFormOptions = {
  projects: Named[];
  teamMembers: Named[];
  suppliers: Named[];
};

/** Persistence of Stores (CM-508); each write is one transaction with its audit. */
export type StoreRepository = {
  list(params: StoreListParams): Promise<StoreListPage>;
  find(workspaceId: string, id: string): Promise<StoreReadModel | null>;
  create(
    actor: ProcurementCommandActor,
    draft: StoreDraft,
  ): Promise<StoreReadModel>;
  update(
    actor: ProcurementCommandActor,
    id: string,
    draft: StoreDraft,
    expectedUpdatedAt: Date,
  ): Promise<StoreReadModel>;
  delete(
    actor: ProcurementCommandActor,
    id: string,
    expectedUpdatedAt: Date,
  ): Promise<void>;
  stock(workspaceId: string, storeId: string): Promise<StoreStockRow[]>;
  /** Live stores by name, those serving `projectId` when given. */
  options(workspaceId: string, projectId?: string): Promise<StoreOption[]>;
};

/** What the store form offers: live Projects, active Team Members and Suppliers. */
export type StoreFormOptionsReader = {
  read(workspaceId: string): Promise<StoreFormOptions>;
};

/** Central Stores (CM-508, ADR CM-0015 §11). */
export class StoreHandlers {
  constructor(
    private readonly stores: StoreRepository,
    private readonly formOptionsReader: StoreFormOptionsReader,
  ) {}

  list(params: StoreListParams): Promise<StoreListPage> {
    return this.stores.list(params);
  }

  get(workspaceId: string, id: string): Promise<StoreReadModel | null> {
    return this.stores.find(workspaceId, id);
  }

  create(actor: ProcurementCommandActor, input: StoreInput) {
    return this.stores.create(actor, storeDraft(input));
  }

  update(
    actor: ProcurementCommandActor,
    id: string,
    input: StoreInput,
    expectedUpdatedAt: Date,
  ) {
    return this.stores.update(actor, id, storeDraft(input), expectedUpdatedAt);
  }

  delete(actor: ProcurementCommandActor, id: string, expectedUpdatedAt: Date) {
    return this.stores.delete(actor, id, expectedUpdatedAt);
  }

  stock(workspaceId: string, storeId: string) {
    return this.stores.stock(workspaceId, storeId);
  }

  options(workspaceId: string, projectId?: string) {
    return this.stores.options(workspaceId, projectId);
  }

  formOptions(workspaceId: string) {
    return this.formOptionsReader.read(workspaceId);
  }
}
