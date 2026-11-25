import { conflict, notFound } from "../domain/errors";
import { feeHeadName } from "../domain/fee-structure";
import { assertRole, MANAGER_ROLES, type PreschoolActor } from "./access";
import type { FeeHeadFields, FeeHeadStore } from "./fee-ports";
import type { FeeHeadListView, FeeHeadView } from "./fee-views";

/** Fee Heads belong to the Workspace; only the Owner changes them. */
export class FeeHeadHandlers {
  constructor(
    private readonly deps: { store: FeeHeadStore; now: () => Date },
  ) {}

  async list(
    actor: PreschoolActor,
    query: { includeArchived: boolean },
  ): Promise<FeeHeadListView> {
    assertRole(actor, MANAGER_ROLES);
    return {
      items: await this.deps.store.list(
        actor.workspaceId,
        query.includeArchived,
      ),
    };
  }

  async create(
    actor: PreschoolActor,
    input: FeeHeadFields,
  ): Promise<FeeHeadView> {
    assertRole(actor, ["owner"]);
    const fields = { ...input, name: feeHeadName(input.name) };
    await this.assertNameFree(actor.workspaceId, fields.name);
    return this.deps.store.create(actor.workspaceId, fields);
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: FeeHeadFields,
  ): Promise<FeeHeadView> {
    assertRole(actor, ["owner"]);
    const head = await this.get(actor.workspaceId, id);
    const fields = { ...input, name: feeHeadName(input.name) };
    if (!head.isArchived)
      await this.assertNameFree(actor.workspaceId, fields.name, id);
    if (
      fields.kind !== head.kind &&
      (await this.deps.store.onAnyStructure(actor.workspaceId, id))
    )
      throw conflict(
        "FEE_HEAD_KIND_LOCKED",
        `${head.name} is on a Fee Structure, so it cannot change between one-time and recurring.`,
      );
    return this.deps.store.update(actor.workspaceId, id, fields);
  }

  async archive(actor: PreschoolActor, id: string): Promise<FeeHeadView> {
    assertRole(actor, ["owner"]);
    const head = await this.get(actor.workspaceId, id);
    if (head.isArchived) return head;
    return this.deps.store.setArchivedAt(
      actor.workspaceId,
      id,
      this.deps.now(),
    );
  }

  async restore(actor: PreschoolActor, id: string): Promise<FeeHeadView> {
    assertRole(actor, ["owner"]);
    const head = await this.get(actor.workspaceId, id);
    if (!head.isArchived) return head;
    await this.assertNameFree(actor.workspaceId, head.name, id);
    return this.deps.store.setArchivedAt(actor.workspaceId, id, null);
  }

  private async get(workspaceId: string, id: string): Promise<FeeHeadView> {
    const head = await this.deps.store.find(workspaceId, id);
    if (head == null)
      throw notFound("FEE_HEAD_NOT_FOUND", "Fee Head not found.");
    return head;
  }

  private async assertNameFree(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    if (await this.deps.store.nameTaken(workspaceId, name, exceptId))
      throw conflict(
        "FEE_HEAD_NAME_IN_USE",
        `There is already a Fee Head called ${name}.`,
      );
  }
}
