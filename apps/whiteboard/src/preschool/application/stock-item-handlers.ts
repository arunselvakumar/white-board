import { conflict, notFound } from "../domain/errors";
import { stockItemFields, type StockItemFields } from "../domain/stock-item";
import { assertRole, STAFF_ROLES, type PreschoolActor } from "./access";
import type { StockItemStore } from "./stock-ports";
import type { StockItemListView, StockItemView } from "./stock-views";

/**
 * Stock Items belong to the Workspace: Head Office defines the list once and
 * every Centre keeps its own quantities. Only the Owner changes the list.
 */
export class StockItemHandlers {
  constructor(
    private readonly deps: { store: StockItemStore; now: () => Date },
  ) {}

  async list(
    actor: PreschoolActor,
    query: { includeArchived: boolean },
  ): Promise<StockItemListView> {
    assertRole(actor, STAFF_ROLES);
    return {
      items: await this.deps.store.list(
        actor.workspaceId,
        query.includeArchived,
      ),
    };
  }

  async create(
    actor: PreschoolActor,
    input: StockItemFields,
  ): Promise<StockItemView> {
    assertRole(actor, ["owner"]);
    const fields = stockItemFields(input);
    await this.assertNameFree(actor.workspaceId, fields.name);
    return this.deps.store.create(actor.workspaceId, fields);
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: StockItemFields,
  ): Promise<StockItemView> {
    assertRole(actor, ["owner"]);
    const item = await this.get(actor.workspaceId, id);
    const fields = stockItemFields(input);
    if (!item.isArchived)
      await this.assertNameFree(actor.workspaceId, fields.name, id);
    return this.deps.store.update(actor.workspaceId, id, fields);
  }

  async archive(actor: PreschoolActor, id: string): Promise<StockItemView> {
    assertRole(actor, ["owner"]);
    const item = await this.get(actor.workspaceId, id);
    if (item.isArchived) return item;
    return this.deps.store.setArchivedAt(
      actor.workspaceId,
      id,
      this.deps.now(),
    );
  }

  async restore(actor: PreschoolActor, id: string): Promise<StockItemView> {
    assertRole(actor, ["owner"]);
    const item = await this.get(actor.workspaceId, id);
    if (!item.isArchived) return item;
    await this.assertNameFree(actor.workspaceId, item.name, id);
    return this.deps.store.setArchivedAt(actor.workspaceId, id, null);
  }

  private async get(workspaceId: string, id: string): Promise<StockItemView> {
    const item = await this.deps.store.find(workspaceId, id);
    if (item == null)
      throw notFound("STOCK_ITEM_NOT_FOUND", "Stock Item not found.");
    return item;
  }

  private async assertNameFree(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (await this.deps.store.nameTaken(workspaceId, name, exceptId))
      throw conflict(
        "STOCK_ITEM_NAME_IN_USE",
        `There is already a Stock Item called ${name}.`,
      );
  }
}
