import { assertCan, type MemberAccess } from "@/src/shared-kernel/access";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  clientDetails,
  clientInUse,
  clientNotFound,
  type ClientDetails,
  type ClientInput,
} from "../domain/client";

export const CLIENTS_MENU = "masters.clients";

/** A live Client as stored. */
export type StoredClient = ClientDetails & {
  id: string;
  workspaceId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type ClientListParams = {
  workspaceId: string;
  /** Name, contact person, email, GSTIN or mobile digits. */
  search?: string;
  isActive?: boolean;
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

/** A Client in a picker (the Project form). */
export type ClientOption = {
  id: string;
  name: string;
  gstin: string | null;
  stateCode: string | null;
  isActive: boolean;
};

/**
 * Where Clients live (Prisma in infrastructure). Writes run in one
 * transaction with their audit event.
 */
export type ClientStore = {
  find(workspaceId: string, id: string): Promise<StoredClient | null>;
  /** Newest first (root ADR-0020). */
  list(params: ClientListParams): Promise<{
    items: StoredClient[];
    total: number;
    hasMore: boolean;
  }>;
  /**
   * Active Clients by name matching `search`, at most `limit`; with `ids`,
   * those live Clients whatever their state (a form's current pick).
   */
  options(input: {
    workspaceId: string;
    search?: string;
    ids?: readonly string[];
    limit: number;
  }): Promise<ClientOption[]>;
  /** 409 `CLIENT_NAME_TAKEN` when a live one has the name (any case). */
  insert(client: StoredClient): Promise<void>;
  /**
   * Replaces the details when `updatedAt` is still `expectedUpdatedAt`
   * (else 409 `CLIENT_CHANGED`); 409 `CLIENT_NAME_TAKEN` as on insert.
   */
  update(input: {
    before: StoredClient;
    after: StoredClient;
    expectedUpdatedAt: Date;
  }): Promise<void>;
  /** Tombstones it; 409 `CLIENT_CHANGED` when `expectedUpdatedAt` is stale. */
  delete(input: {
    client: StoredClient;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
};

/**
 * How many live Projects link the Client (ADR CM-0023 §2). Masters never
 * imports projects: `src/composition` implements it with a plain read.
 */
export type ClientUsage = (workspaceId: string, id: string) => Promise<number>;

export type ClientCommand = ClientInput & {
  /** Inactive Clients leave the Project form's picker. Defaults to active. */
  isActive?: boolean;
};

/**
 * Masters → Clients (CM-1101, ADR CM-0023 §2; menu `masters.clients`,
 * C R U D). Names are unique among a Company's live Clients ignoring case.
 * A Client a live Project links cannot be deleted.
 */
export class ClientHandlers {
  constructor(
    private readonly store: ClientStore,
    private readonly usage: ClientUsage,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async load(workspaceId: string, id: string) {
    const client = await this.store.find(workspaceId, id);
    if (client == null) throw clientNotFound();
    return client;
  }

  async get(access: MemberAccess, id: string): Promise<StoredClient> {
    assertCan(access, CLIENTS_MENU, "read");
    return this.load(access.workspaceId, id);
  }

  async list(
    access: MemberAccess,
    params: Omit<ClientListParams, "workspaceId">,
  ) {
    assertCan(access, CLIENTS_MENU, "read");
    return this.store.list({ ...params, workspaceId: access.workspaceId });
  }

  /**
   * The Project form's Client picker. The route decides who may read it
   * (Clients read, or Project create / update).
   */
  options(input: {
    workspaceId: string;
    search?: string;
    ids?: readonly string[];
    limit: number;
  }): Promise<ClientOption[]> {
    return this.store.options(input);
  }

  async create(
    access: MemberAccess,
    input: ClientCommand,
  ): Promise<StoredClient> {
    assertCan(access, CLIENTS_MENU, "create");
    const details = clientDetails(input);
    const now = this.clock();
    const client: StoredClient = {
      ...details,
      id: newId(now.getTime()),
      workspaceId: access.workspaceId,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
      createdBy: access.userId,
      updatedBy: access.userId,
    };
    await this.store.insert(client);
    return client;
  }

  /** The whole form; `isActive` left out keeps it. */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: ClientCommand,
  ): Promise<StoredClient> {
    assertCan(access, CLIENTS_MENU, "update");
    const before = await this.load(access.workspaceId, id);
    const details = clientDetails(input);
    const now = this.clock();
    const after: StoredClient = {
      ...before,
      ...details,
      isActive: input.isActive ?? before.isActive,
      updatedAt: now,
      updatedBy: access.userId,
    };
    await this.store.update({ before, after, expectedUpdatedAt });
    return after;
  }

  /** 409 `CLIENT_IN_USE` with `details.projectCount` while a live Project links it. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    assertCan(access, CLIENTS_MENU, "delete");
    const client = await this.load(access.workspaceId, id);
    const projectCount = await this.usage(access.workspaceId, id);
    if (projectCount > 0) throw clientInUse(projectCount);
    await this.store.delete({
      client,
      expectedUpdatedAt,
      by: access.userId,
      now: this.clock(),
    });
  }
}
