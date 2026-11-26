import {
  assertCanClose,
  assertCanReopen,
  centreDetails,
  franchiseTerms,
  type CentreOwnership,
} from "../domain/centre";
import type { IsoDate } from "../domain/dates";
import { notFound } from "../domain/errors";
import {
  assertCentre,
  assertRole,
  MANAGER_ROLES,
  type PreschoolActor,
} from "./access";
import type { CentreRecord, CentreStore } from "./centre-ports";
import {
  centreView,
  type CentreListView,
  type CentreView,
} from "./centre-views";

export type CentreDetailsInput = {
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
};

export type FranchiseInput = {
  ownership: CentreOwnership;
  franchiseeName?: string | null;
  franchiseePhone?: string | null;
  franchiseeEmail?: string | null;
  agreementStartOn?: IsoDate | null;
  agreementEndOn?: IsoDate | null;
  /** 0–100, up to two decimals. */
  royaltyPercent?: number | null;
  mayOverrideFees: boolean;
};

const OWNER_ONLY = "Only the Owner can change Centres.";

/**
 * Centres (ADR-0055). The Owner and Centre Heads read the Centres they may
 * open; only the Owner adds, edits, closes and reopens them.
 */
export class CentreHandlers {
  constructor(
    private readonly deps: {
      store: CentreStore;
      newId: () => string;
    },
  ) {}

  async list(actor: PreschoolActor): Promise<CentreListView> {
    assertRole(actor, MANAGER_ROLES);
    const rows = await this.deps.store.list(actor.workspaceId, actor.centreIds);
    return { items: rows.map((row) => centreView(row, row)) };
  }

  async get(actor: PreschoolActor, id: string): Promise<CentreView> {
    assertRole(actor, MANAGER_ROLES);
    const record = await this.load(actor, id);
    assertCentre(actor, record.id);
    return this.view(actor, record);
  }

  async create(
    actor: PreschoolActor,
    input: CentreDetailsInput & FranchiseInput,
  ): Promise<CentreView> {
    assertRole(actor, ["owner"], OWNER_ONLY);
    const details = centreDetails(input);
    const terms = franchiseTerms(input);
    const id = this.deps.newId();
    await this.deps.store.create({
      ...details,
      ...terms,
      id,
      workspaceId: actor.workspaceId,
    });
    return this.view(actor, await this.load(actor, id));
  }

  async updateDetails(
    actor: PreschoolActor,
    id: string,
    input: CentreDetailsInput,
  ): Promise<CentreView> {
    assertRole(actor, ["owner"], OWNER_ONLY);
    await this.load(actor, id);
    await this.deps.store.updateDetails(
      actor.workspaceId,
      id,
      centreDetails(input),
    );
    return this.view(actor, await this.load(actor, id));
  }

  async updateFranchise(
    actor: PreschoolActor,
    id: string,
    input: FranchiseInput,
  ): Promise<CentreView> {
    assertRole(actor, ["owner"], OWNER_ONLY);
    await this.load(actor, id);
    await this.deps.store.updateFranchise(
      actor.workspaceId,
      id,
      franchiseTerms(input),
    );
    return this.view(actor, await this.load(actor, id));
  }

  async close(actor: PreschoolActor, id: string): Promise<CentreView> {
    assertRole(actor, ["owner"], OWNER_ONLY);
    const record = await this.load(actor, id);
    const counts = await this.deps.store.counts(actor.workspaceId, id);
    assertCanClose(record, counts.activeChildren);
    await this.deps.store.setStatus(actor.workspaceId, id, "closed");
    return this.view(actor, await this.load(actor, id));
  }

  async reopen(actor: PreschoolActor, id: string): Promise<CentreView> {
    assertRole(actor, ["owner"], OWNER_ONLY);
    assertCanReopen(await this.load(actor, id));
    await this.deps.store.setStatus(actor.workspaceId, id, "active");
    return this.view(actor, await this.load(actor, id));
  }

  /** 404 for an id that is not a Centre of this Workspace. */
  private async load(actor: PreschoolActor, id: string): Promise<CentreRecord> {
    const record = await this.deps.store.find(actor.workspaceId, id);
    if (record == null)
      throw notFound("CENTRE_NOT_FOUND", "The Centre was not found.");
    return record;
  }

  private async view(
    actor: PreschoolActor,
    record: CentreRecord,
  ): Promise<CentreView> {
    return centreView(
      record,
      await this.deps.store.counts(actor.workspaceId, record.id),
    );
  }
}
